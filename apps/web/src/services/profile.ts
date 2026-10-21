import 'server-only';
import { prisma } from '@prostor/db';
import type { ChangePasswordInput, UpdateProfileInput } from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { invalidateSessionCache } from '@/lib/auth/session-guard';
import { passwordChangedEmail } from '@/lib/email-templates';
import { sendMail } from '@/lib/mail';
import { hashPassword, verifyPassword } from '@/lib/password';
import { rateLimit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';

interface RequestMeta {
  ip: string;
  userAgent: string | null;
}

export interface AccountOverview {
  name: string | null;
  email: string;
  hasPassword: boolean;
  emailNotifications: boolean;
  providers: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
}

export async function getAccountOverview(userId: string): Promise<AccountOverview> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      passwordHash: true,
      emailNotifications: true,
      createdAt: true,
      lastLoginAt: true,
      accounts: { select: { provider: true } },
    },
  });
  return {
    name: user.name,
    email: user.email,
    hasPassword: user.passwordHash !== null,
    emailNotifications: user.emailNotifications,
    providers: user.accounts.map((a) => a.provider),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function updateProfile(user: SessionUser, input: UpdateProfileInput): Promise<void> {
  await prisma.user.update({ where: { id: user.id }, data: { name: input.name } });
  // Имя в JWT берётся из кеша session-guard — сбрасываем, чтобы шапка обновилась сразу
  invalidateSessionCache(user.id);
  await audit({ action: 'account.update', actorId: user.id, metadata: { fields: ['name'] } });
}

/**
 * Смена пароля. sessionVersion++ гасит все сессии, включая текущую —
 * клиент сразу входит заново с новым паролем и получает свежий JWT.
 */
export async function changePassword(
  user: SessionUser,
  input: ChangePasswordInput,
  meta: RequestMeta,
): Promise<void> {
  const limit = await rateLimit(`password-change:user:${user.id}`, 10, 60 * 60);
  if (!limit.ok) throw new ApiError(429, 'rate_limited', 'Слишком много попыток. Попробуйте позже');

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true, passwordHash: true },
  });
  if (record.passwordHash) {
    const ok = input.currentPassword
      ? await verifyPassword(input.currentPassword, record.passwordHash)
      : false;
    if (!ok) {
      throw new ApiError(400, 'invalid_password', 'Неверный текущий пароль', {
        currentPassword: 'Неверный текущий пароль',
      });
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.password), sessionVersion: { increment: 1 } },
  });
  invalidateSessionCache(user.id);
  await audit({ action: 'auth.password_change', actorId: user.id, ...meta });
  await sendMail(passwordChangedEmail({ to: record.email })).catch((error: unknown) =>
    console.error('[profile] failed to send password-changed email', error),
  );
}

/** «Выйти на всех устройствах»: все выданные JWT перестают проходить проверку */
export async function signOutEverywhere(user: SessionUser, meta: RequestMeta): Promise<void> {
  await prisma.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
  });
  invalidateSessionCache(user.id);
  await audit({ action: 'auth.logout_all', actorId: user.id, ...meta });
}

/** Письма об упоминаниях и ответах в комментариях */
export async function setEmailNotifications(user: SessionUser, enabled: boolean): Promise<void> {
  await prisma.user.update({ where: { id: user.id }, data: { emailNotifications: enabled } });
  await audit({ action: 'account.update', actorId: user.id, metadata: { fields: ['emailNotifications'], enabled } });
}
