import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, safeEqual } from './tokens';

describe('tokens', () => {
  it('генерирует уникальные url-safe токены длиной 43 символа (32 байта)', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('хеш детерминирован и не совпадает с токеном', () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
    expect(hashToken(t)).toHaveLength(64);
  });

  it('safeEqual сравнивает строки разной длины без исключения', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
