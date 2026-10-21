import { z } from 'zod';

/**
 * Роли продублированы из Prisma намеренно: packages/shared не зависит
 * от @prisma/client и может использоваться в браузере.
 * Соответствие enum Role в schema.prisma проверяется тестом.
 */
export const ROLES = ['OWNER', 'EDITOR', 'VIEWER', 'GUEST'] as const;
export const roleSchema = z.enum(ROLES);
export type BoardRole = z.infer<typeof roleSchema>;

const ROLE_RANK: Record<BoardRole, number> = {
  OWNER: 40,
  EDITOR: 30,
  VIEWER: 20,
  GUEST: 10,
};

export function roleRank(role: BoardRole): number {
  return ROLE_RANK[role];
}

/** true, если `role` не ниже `required` */
export function hasRole(role: BoardRole | null | undefined, required: BoardRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Наибольшая из ролей (для наследования доска ← папка ← организация) */
export function maxRole(...roles: ReadonlyArray<BoardRole | null | undefined>): BoardRole | null {
  let best: BoardRole | null = null;
  for (const r of roles) {
    if (r && (best === null || ROLE_RANK[r] > ROLE_RANK[best])) best = r;
  }
  return best;
}

/** Политики организации, применимые к доске (см. Organization в schema.prisma) */
export const orgPolicySchema = z.object({
  allowExport: z.boolean().default(true),
  allowCopy: z.boolean().default(true),
  allowDeleteOthers: z.boolean().default(true),
  guestCanVote: z.boolean().default(true),
  guestCanUseTimer: z.boolean().default(false),
});
export type OrgPolicy = z.infer<typeof orgPolicySchema>;

export const DEFAULT_POLICY: OrgPolicy = orgPolicySchema.parse({});

export type BoardAction =
  | 'view'
  | 'edit'
  | 'comment'
  | 'vote'
  | 'timer'
  | 'export'
  | 'copy'
  | 'deleteOthers'
  | 'share'
  | 'manage';

/**
 * Единая матрица прав. Используется:
 *  - в REST API (services/*) — для ответа 403;
 *  - на WS-сервере — для решения, принимать ли messageSync;
 *  - на клиенте — чтобы скрыть недоступные кнопки (не как защита!).
 */
export function can(
  role: BoardRole | null | undefined,
  action: BoardAction,
  policy: OrgPolicy = DEFAULT_POLICY,
): boolean {
  if (!role) return false;
  switch (action) {
    case 'view':
      return true;
    case 'comment':
      return hasRole(role, 'VIEWER');
    case 'edit':
      return hasRole(role, 'EDITOR');
    case 'vote':
      return role === 'GUEST' ? policy.guestCanVote : true;
    case 'timer':
      return role === 'GUEST' ? policy.guestCanUseTimer : hasRole(role, 'EDITOR');
    case 'export':
      // OWNER может экспортировать всегда — иначе владелец теряет свои данные
      return role === 'OWNER' || (policy.allowExport && hasRole(role, 'VIEWER'));
    case 'copy':
      return role === 'OWNER' || (policy.allowCopy && hasRole(role, 'VIEWER'));
    case 'deleteOthers':
      return role === 'OWNER' || (policy.allowDeleteOthers && hasRole(role, 'EDITOR'));
    case 'share':
      return hasRole(role, 'EDITOR');
    case 'manage':
      return role === 'OWNER';
  }
}
