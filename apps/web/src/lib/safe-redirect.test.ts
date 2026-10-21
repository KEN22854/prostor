import { describe, expect, it } from 'vitest';
import { safeCallbackUrl } from './safe-redirect';

describe('safeCallbackUrl', () => {
  it('пропускает внутренние пути', () => {
    expect(safeCallbackUrl('/board/abc?x=1')).toBe('/board/abc?x=1');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '',
    null,
    undefined,
  ])('отклоняет внешний/пустой адрес %s', (value) => {
    expect(safeCallbackUrl(value)).toBe('/dashboard');
  });

  it('не возвращает на страницы авторизации', () => {
    expect(safeCallbackUrl('/login')).toBe('/dashboard');
    expect(safeCallbackUrl('/register?callbackUrl=/x')).toBe('/dashboard');
    expect(safeCallbackUrl('/login-history')).toBe('/login-history');
  });
});
