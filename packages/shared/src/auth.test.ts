import { describe, expect, it } from 'vitest';
import { loginSchema, passwordSchema, registerSchema } from './auth';

describe('auth schemas', () => {
  it('нормализует email: trim + lower case', () => {
    const r = loginSchema.parse({ email: '  Anna@Example.RU ', password: 'x' });
    expect(r.email).toBe('anna@example.ru');
  });

  it('требует буквы и цифры в пароле', () => {
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
    expect(passwordSchema.safeParse('пароль123').success).toBe(true);
  });

  it('ограничивает пароль 72 байтами (лимит bcrypt), а не символами', () => {
    // 40 кириллических символов = 80 байт UTF-8
    expect(passwordSchema.safeParse(`${'я'.repeat(39)}1`).success).toBe(false);
    expect(passwordSchema.safeParse(`${'a'.repeat(70)}1`).success).toBe(true);
  });

  it('проверяет совпадение паролей при регистрации', () => {
    const r = registerSchema.safeParse({
      name: 'Аня',
      email: 'a@b.ru',
      password: 'secret123',
      confirmPassword: 'secret124',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['confirmPassword']);
  });
});
