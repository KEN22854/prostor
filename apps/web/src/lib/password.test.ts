import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from './password';

describe('пароли (scrypt)', () => {
  it('хеш проверяется, чужой пароль — нет, соль у каждого хеша своя', async () => {
    const a = await hashPassword('Секрет-123');
    const b = await hashPassword('Секрет-123');
    expect(a).toMatch(/^scrypt\$15\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('Секрет-123', a)).toBe(true);
    expect(await verifyPassword('секрет-123', a)).toBe(false);
    expect(needsRehash(a)).toBe(false);
  });

  it('старые bcrypt-хеши продолжают работать и помечаются на перехеширование', async () => {
    const legacy = await bcrypt.hash('old-pass-1', 4);
    expect(await verifyPassword('old-pass-1', legacy)).toBe(true);
    expect(await verifyPassword('wrong', legacy)).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it('повреждённый хеш не пропускает', async () => {
    expect(await verifyPassword('x', 'scrypt$15$8$1$$')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$99$8$1$AAAA$AAAA')).toBe(false);
  });
});
