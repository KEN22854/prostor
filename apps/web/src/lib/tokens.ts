import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Одноразовые токены (сброс пароля, приглашения).
 * Пользователь получает сырой токен, в БД — только SHA-256:
 * утечка дампа БД не даёт рабочих ссылок.
 * SHA-256 (а не bcrypt) достаточно: токен — 256 бит случайности, перебор невозможен.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
