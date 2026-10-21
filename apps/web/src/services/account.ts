import 'server-only';
import { prisma } from '@prostor/db';
import type { ForgotPasswordInput, RegisterInput, ResetPasswordInput } from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { invalidateSessionCache } from '@/lib/auth/session-guard';
import { passwordChangedEmail, passwordResetEmail } from '@/lib/email-templates';
import { env } from '@/lib/env';
import { sendMail } from '@/lib/mail';
import { hashPassword } from '@/lib/password';
import { rateLimit } from '@/lib/rate-limit';
import { generateToken, hashToken } from '@/lib/tokens';
import { audit } from '@/services/audit';
import { autoJoinByDomain } from '@/services/orgs';

const RESET_TTL_MINUTES = 60;

interface RequestMeta {
  ip: string;
  userAgent: string | null;
}

function rateLimited(retryAfter: number): ApiError {
  return new ApiError(429, 'rate_limited', 'Слишком много попыток. Попробуйте позже', undefined, {
    'Retry-After': String(retryAfter),
  });
}

export async function registerUser(
  input: RegisterInput,
  meta: RequestMeta,
): Promise<{ id: string }> {
  if (!env().ALLOW_SIGNUP) {
    throw new ApiError(
      403,
      'signup_disabled',
      'Регистрация закрыта. Попросите приглашение у администратора',
    );
  }
  const limit = await rateLimit(`register:ip:${meta.ip}`, 10, 60 * 60);
  if (!limit.ok) throw rateLimited(limit.retryAfter);

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    // Здесь перечисление email неизбежно (форма регистрации обязана сказать «занято»),
    // поэтому от массового перебора защищает rate-limit выше.
    throw new ApiError(409, 'email_taken', 'Пользователь с таким email уже существует', {
      email: 'Email уже зарегистрирован',
    });
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash },
      select: { id: true },
    });
    await audit({
      action: 'auth.login',
      actorId: user.id,
      metadata: { method: 'register' },
      ...meta,
    });
    // Почта корпоративного домена — сразу в организацию (Organization.allowedEmailDomains)
    await autoJoinByDomain(user.id, input.email).catch((e: unknown) =>
      console.error('[account] auto-join failed', e),
    );
    return user;
  } catch (error: unknown) {
    // Гонка двух одновременных регистраций с одним email → уникальный индекс
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new ApiError(409, 'email_taken', 'Пользователь с таким email уже существует', {
        email: 'Email уже зарегистрирован',
      });
    }
    throw error;
  }
}

/**
 * Всегда отвечает одинаково, существует email или нет —
 * иначе форма «забыли пароль» превращается в проверку регистрации.
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput,
  meta: RequestMeta,
): Promise<void> {
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`reset:ip:${meta.ip}`, 10, 60 * 60),
    rateLimit(`reset:email:${input.email}`, 3, 60 * 60),
  ]);
  if (!byIp.ok) throw rateLimited(byIp.retryAfter);
  // Лимит по email не раскрываем ошибкой — просто молча не шлём письмо
  if (!byEmail.ok) return;

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, email: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return;

  const token = generateToken();
  await prisma.$transaction([
    // Действует только последняя ссылка
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    }),
  ]);

  const url = new URL('/reset-password', env().APP_URL);
  url.searchParams.set('token', token);
  try {
    await sendMail(
      passwordResetEmail({
        to: user.email,
        name: user.name,
        url: url.toString(),
        ttlMinutes: RESET_TTL_MINUTES,
      }),
    );
  } catch (error: unknown) {
    console.error('[account] failed to send reset email', error);
    throw new ApiError(502, 'mail_failed', 'Не удалось отправить письмо. Попробуйте позже');
  }
}

export async function resetPassword(input: ResetPasswordInput, meta: RequestMeta): Promise<void> {
  const limit = await rateLimit(`reset-confirm:ip:${meta.ip}`, 20, 60 * 60);
  if (!limit.ok) throw rateLimited(limit.retryAfter);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { email: true } },
    },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ApiError(
      400,
      'invalid_token',
      'Ссылка недействительна или устарела. Запросите новую',
    );
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    // updateMany с условием usedAt: null — атомарная защита от двойного использования:
    // из двух параллельных запросов с одним токеном пароль сменит только первый.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ApiError(400, 'invalid_token', 'Ссылка уже использована. Запросите новую');
    }
    await tx.user.update({
      where: { id: record.userId },
      // sessionVersion++ → все выданные ранее JWT становятся недействительными
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.deleteMany({
      where: { userId: record.userId, id: { not: record.id } },
    });
  });
  invalidateSessionCache(record.userId);

  await audit({ action: 'auth.password_reset', actorId: record.userId, ...meta });
  await sendMail(passwordChangedEmail({ to: record.user.email })).catch((error: unknown) =>
    console.error('[account] failed to send password-changed email', error),
  );
}
