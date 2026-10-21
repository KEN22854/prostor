import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Шифрование секретов в БД (секрет TOTP): AES-256-GCM, ключ AUTH_ENCRYPTION_KEY.
 * Утечка дампа БД без ключа не раскрывает секреты 2FA.
 * Формат: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
function key(): Buffer {
  return Buffer.from(env().AUTH_ENCRYPTION_KEY, 'hex');
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function open(sealed: string): string {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Неизвестный формат зашифрованного значения');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
