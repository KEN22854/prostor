import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROLES, can, hasRole, maxRole } from './permissions';

describe('permissions', () => {
  it('hasRole учитывает иерархию', () => {
    expect(hasRole('OWNER', 'EDITOR')).toBe(true);
    expect(hasRole('VIEWER', 'EDITOR')).toBe(false);
    expect(hasRole(null, 'GUEST')).toBe(false);
  });

  it('maxRole выбирает наибольшую унаследованную роль', () => {
    expect(maxRole('VIEWER', null, 'EDITOR', undefined)).toBe('EDITOR');
    expect(maxRole(null, undefined)).toBeNull();
  });

  it('viewer не может редактировать, но может комментировать', () => {
    expect(can('VIEWER', 'edit')).toBe(false);
    expect(can('VIEWER', 'comment')).toBe(true);
  });

  it('политики организации ограничивают экспорт, но не для владельца', () => {
    const policy = {
      allowExport: false,
      allowCopy: false,
      allowDeleteOthers: false,
      guestCanVote: false,
      guestCanUseTimer: false,
    };
    expect(can('EDITOR', 'export', policy)).toBe(false);
    expect(can('OWNER', 'export', policy)).toBe(true);
    expect(can('EDITOR', 'deleteOthers', policy)).toBe(false);
    expect(can('GUEST', 'vote', policy)).toBe(false);
  });

  it('роли синхронизированы с enum Role в schema.prisma', () => {
    const schemaPath = fileURLToPath(new URL('../../db/prisma/schema.prisma', import.meta.url));
    const schema = readFileSync(schemaPath, 'utf8');
    const block = /enum Role \{([^}]*)\}/.exec(schema)?.[1] ?? '';
    const prismaRoles = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[A-Z_]+$/.test(l));
    expect(prismaRoles).toEqual([...ROLES]);
  });
});
