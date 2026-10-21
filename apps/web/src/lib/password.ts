import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Хеширование паролей — scrypt из node:crypto.
 *
 * Раньше был bcryptjs (чистый JS): ~300 мс CPU на хеш прямо в event loop
 * сервера — всплеск входов тормозил все остальные запросы. scrypt считается
 * нативно в пуле потоков libuv и не блокирует сервер.
 *
 * Параметры N=2^15, r=8, p=1 (≈32 МБ памяти и ~100 мс на хеш) — в диапазоне
 * рекомендаций OWASP для scrypt. Формат: scrypt$<logN>$<r>$<p>$<salt>$<hash>.
 * Старые bcrypt-хеши ($2a$/$2b$) проверяются и перехешируются при входе.
 */
const LOG_N = 15;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const PREFIX = 'scrypt$';

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keyLen, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

function options(logN: number, r: number, p: number): ScryptOptions {
  // maxmem по умолчанию (32 МБ) впритык к 128·N·r — даём запас
  return { N: 2 ** logN, r, p, maxmem: 256 * 2 ** logN * r };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LEN, options(LOG_N, R, P));
  return `${PREFIX}${LOG_N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(PREFIX)) return bcrypt.compare(password, stored);
  const [logN, r, p, salt, hash] = stored.slice(PREFIX.length).split('$');
  const params = [Number(logN), Number(r), Number(p)];
  if (!salt || !hash || params.some((n) => !Number.isInteger(n) || n <= 0) || Number(logN) > 20)
    return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(
    password.normalize('NFKC'),
    Buffer.from(salt, 'base64'),
    expected.length,
    options(Number(logN), Number(r), Number(p)),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Хеш старого формата или с устаревшими параметрами — перехешировать после успешного входа */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`${PREFIX}${LOG_N}$${R}$${P}$`);
}
