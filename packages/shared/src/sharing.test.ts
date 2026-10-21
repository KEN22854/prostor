import { describe, expect, it } from 'vitest';
import { grantableRoles, inviteProblem, ttlToExpiry, type InviteLike } from './sharing';

const base: InviteLike = { boardId: 'b1', email: null, expiresAt: null, maxUses: null, uses: 0, revokedAt: null };
const now = new Date('2026-10-21T12:00:00Z');

describe('inviteProblem', () => {
  it('действующая ссылка', () => {
    expect(inviteProblem(base, { boardId: 'b1', userEmail: 'a@b.ru', now })).toBeNull();
  });

  it('другая доска, отзыв, истечение, лимит', () => {
    expect(inviteProblem(base, { boardId: 'b2', userEmail: null, now })).toBe('wrong_board');
    expect(inviteProblem({ ...base, revokedAt: now }, { boardId: 'b1', userEmail: null, now })).toBe('revoked');
    expect(inviteProblem({ ...base, expiresAt: new Date('2026-10-21T11:59:59Z') }, { boardId: 'b1', userEmail: null, now })).toBe('expired');
    expect(inviteProblem({ ...base, maxUses: 3, uses: 3 }, { boardId: 'b1', userEmail: null, now })).toBe('exhausted');
    expect(inviteProblem({ ...base, maxUses: 3, uses: 2 }, { boardId: 'b1', userEmail: null, now })).toBeNull();
  });

  it('адресное приглашение принимает только владелец email (без учёта регистра)', () => {
    const invite = { ...base, email: 'anna@company.ru' };
    expect(inviteProblem(invite, { boardId: 'b1', userEmail: 'Anna@Company.ru', now })).toBeNull();
    expect(inviteProblem(invite, { boardId: 'b1', userEmail: 'other@company.ru', now })).toBe('wrong_email');
    // Не вошёл — адрес проверим после входа
    expect(inviteProblem(invite, { boardId: 'b1', userEmail: null, now })).toBeNull();
  });
});

describe('grantableRoles', () => {
  it('редактор не выдаёт владельца, читатель не приглашает', () => {
    expect(grantableRoles('OWNER')).toEqual(['EDITOR', 'VIEWER', 'GUEST']);
    expect(grantableRoles('EDITOR')).toEqual(['EDITOR', 'VIEWER', 'GUEST']);
    expect(grantableRoles('VIEWER')).toEqual([]);
    expect(grantableRoles(null)).toEqual([]);
  });
});

describe('ttlToExpiry', () => {
  it('сроки и бессрочная ссылка', () => {
    const t = now.getTime();
    expect(ttlToExpiry('1d', t)?.toISOString()).toBe('2026-10-22T12:00:00.000Z');
    expect(ttlToExpiry('never', t)).toBeNull();
  });
});
