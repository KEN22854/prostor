import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateBackupCodes,
  generateSecret,
  hotp,
  otpauthUrl,
  stepAt,
  verifyTotp,
} from './totp';

// RFC 6238, приложение B: секрет "12345678901234567890" (ASCII), SHA1, 8 цифр.
// Наши коды — 6 последних цифр тех же значений.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it('base32 туда и обратно', () => {
    const buf = Buffer.from('Привет, 2FA!');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('совпадает с тестовыми векторами RFC', () => {
    // T = 59 с → 94287082; T = 1111111109 → 07081804; T = 1234567890 → 89005924
    expect(hotp(RFC_SECRET, stepAt(59_000))).toBe('287082');
    expect(hotp(RFC_SECRET, stepAt(1_111_111_109_000))).toBe('081804');
    expect(hotp(RFC_SECRET, stepAt(1_234_567_890_000))).toBe('005924');
  });

  it('окно ±30 с, неверный формат и чужой код', () => {
    const secret = generateSecret();
    const now = 1_700_000_000_000;
    const code = hotp(secret, stepAt(now));
    expect(verifyTotp(secret, code, now)).toBe(stepAt(now));
    expect(verifyTotp(secret, code, now + 30_000)).toBe(stepAt(now));
    expect(verifyTotp(secret, code, now + 90_000)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
    // Код от другого секрета не подходит
    const other = generateSecret();
    const foreign = hotp(other, stepAt(now));
    if (foreign !== code) expect(verifyTotp(secret, foreign, now)).toBeNull();
  });

  it('otpauth URL и резервные коды', () => {
    expect(otpauthUrl('ABC', 'anna@prostor.ru')).toBe(
      'otpauth://totp/%D0%9F%D1%80%D0%BE%D1%81%D1%82%D0%BE%D1%80%3Aanna%40prostor.ru?secret=ABC&issuer=%D0%9F%D1%80%D0%BE%D1%81%D1%82%D0%BE%D1%80&algorithm=SHA1&digits=6&period=30',
    );
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
  });
});
