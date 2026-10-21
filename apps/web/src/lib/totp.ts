import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) поверх HOTP (RFC 4226): HMAC-SHA1, шаг 30 с, 6 цифр —
 * параметры, которые понимают Google Authenticator, Яндекс Ключ, 1Password и др.
 */
const STEP_SEC = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-битный секрет (рекомендация RFC 4226) в base32 */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS).toString();
  return code.padStart(DIGITS, '0');
}

export function stepAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / STEP_SEC);
}

/**
 * Проверка кода с окном ±1 шаг (рассинхрон часов телефона до 30 с).
 * Возвращает шаг, на котором код совпал, — по нему блокируется повторное
 * использование того же кода (защита от перехвата и повтора).
 */
export function verifyTotp(
  secret: string,
  code: string,
  timeMs = Date.now(),
  window = 1,
): number | null {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const current = stepAt(timeMs);
  for (let delta = -window; delta <= window; delta++) {
    const expected = Buffer.from(hotp(secret, current + delta));
    if (timingSafeEqual(expected, Buffer.from(normalized))) return current + delta;
  }
  return null;
}

/** URL для QR-кода приложения-аутентификатора */
export function otpauthUrl(secret: string, account: string, issuer = 'Простор'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Резервные коды: 10 штук вида abcd-efgh (показываются один раз, хранятся хешами) */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

export function normalizeBackupCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z2-7]/g, '');
}
