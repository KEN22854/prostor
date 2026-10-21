import 'server-only';
import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import { prisma } from '@prostor/db';
import { ApiError } from '@/lib/api';
import { invalidateSessionCache } from '@/lib/auth/session-guard';
import { redis } from '@/lib/redis';
import { rateLimit } from '@/lib/rate-limit';
import { open, seal } from '@/lib/secret-box';
import type { SessionUser } from '@/lib/session';
import {
  generateBackupCodes,
  generateSecret,
  normalizeBackupCode,
  otpauthUrl,
  verifyTotp,
} from '@/lib/totp';
import { audit } from '@/services/audit';

const PENDING_TTL_SEC = 10 * 60;
const pendingKey = (userId: string) => `2fa:pending:${userId}`;
const hashCode = (code: string) =>
  createHash('sha256').update(normalizeBackupCode(code)).digest('hex');

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrSvg: string;
}

/** Шаг 1: новый секрет (ещё не включён — ждёт подтверждения кодом), QR для приложения */
export async function beginSetup(user: SessionUser): Promise<TwoFactorSetup> {
  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true, twoFactorEnabled: true },
  });
  if (record.twoFactorEnabled)
    throw new ApiError(409, 'already_enabled', 'Двухфакторная аутентификация уже включена');
  const secret = generateSecret();
  await redis().set(pendingKey(user.id), seal(secret), 'EX', PENDING_TTL_SEC);
  const url = otpauthUrl(secret, record.email);
  const qrSvg = await QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    width: 192,
    errorCorrectionLevel: 'M',
  });
  return { secret, otpauthUrl: url, qrSvg };
}

/**
 * Код уже использованного шага не принимается повторно (защита от повтора
 * перехваченного кода в пределах его 30–90 секунд жизни).
 */
async function consumeStep(userId: string, step: number): Promise<boolean> {
  const result = await redis()
    .set(`2fa:used:${userId}:${step}`, '1', 'EX', 120, 'NX')
    .catch(() => 'OK');
  return result === 'OK';
}

/** Шаг 2: подтверждение кодом из приложения — включаем, выдаём резервные коды (один раз) */
export async function confirmSetup(
  user: SessionUser,
  code: string,
): Promise<{ backupCodes: string[] }> {
  const sealed = await redis().get(pendingKey(user.id));
  if (!sealed) throw new ApiError(410, 'setup_expired', 'Время настройки истекло — начните заново');
  const secret = open(sealed);
  const step = verifyTotp(secret, code);
  if (step === null || !(await consumeStep(user.id, step))) {
    throw new ApiError(400, 'invalid_code', 'Неверный код. Проверьте время на телефоне', {
      code: 'Неверный код',
    });
  }
  const backupCodes = generateBackupCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: seal(secret),
      twoFactorBackupKeys: backupCodes.map(hashCode),
    },
  });
  await redis().del(pendingKey(user.id));
  invalidateSessionCache(user.id);
  await audit({ action: 'auth.2fa_enabled', actorId: user.id });
  return { backupCodes };
}

/**
 * Проверка второго фактора при входе: код из приложения или резервный код
 * (резервный — одноразовый, удаляется после использования).
 */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const limit = await rateLimit(`2fa:user:${userId}`, 10, 15 * 60);
  if (!limit.ok) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupKeys: true },
  });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) return true;
  const step = verifyTotp(open(user.twoFactorSecret), code);
  if (step !== null) return consumeStep(userId, step);
  const hashed = hashCode(code);
  if (normalizeBackupCode(code).length === 8 && user.twoFactorBackupKeys.includes(hashed)) {
    // Атомарно: два одновременных входа с одним резервным кодом не пройдут оба
    const updated = await prisma.user.updateMany({
      where: { id: userId, twoFactorBackupKeys: { has: hashed } },
      data: { twoFactorBackupKeys: user.twoFactorBackupKeys.filter((h) => h !== hashed) },
    });
    return updated.count === 1;
  }
  return false;
}

export async function disable(user: SessionUser, code: string): Promise<void> {
  if (!(await verifySecondFactor(user.id, code))) {
    throw new ApiError(400, 'invalid_code', 'Неверный код', { code: 'Неверный код' });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupKeys: [] },
  });
  invalidateSessionCache(user.id);
  await audit({ action: 'auth.2fa_disabled', actorId: user.id });
}

export async function twoFactorStatus(
  userId: string,
): Promise<{ enabled: boolean; backupCodesLeft: number }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorBackupKeys: true },
  });
  return { enabled: user.twoFactorEnabled, backupCodesLeft: user.twoFactorBackupKeys.length };
}
