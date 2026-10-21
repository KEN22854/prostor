import { z } from 'zod';
import { emailSchema } from './auth';
import { hasRole, type BoardRole } from './permissions';

/** Роли, которые можно выдать приглашением или сменой роли (OWNER только один — создатель) */
export const ASSIGNABLE_ROLES = ['EDITOR', 'VIEWER', 'GUEST'] as const;
export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES);
export type AssignableRole = z.infer<typeof assignableRoleSchema>;

export const ROLE_LABELS: Record<BoardRole, string> = {
  OWNER: 'Владелец',
  EDITOR: 'Редактор',
  VIEWER: 'Читатель',
  GUEST: 'Гость',
};

export const ROLE_HINTS: Record<BoardRole, string> = {
  OWNER: 'Полный доступ, управление участниками и удаление доски',
  EDITOR: 'Редактирует доску и приглашает других',
  VIEWER: 'Смотрит и комментирует',
  GUEST: 'Смотрит; голосование и таймер — по настройкам организации',
};

/**
 * Какие роли пользователь может выдавать: не выше своей (редактор не
 * может сделать кого-то владельцем) и только если ему разрешено делиться.
 */
export function grantableRoles(role: BoardRole | null): AssignableRole[] {
  if (!role || !hasRole(role, 'EDITOR')) return [];
  return ASSIGNABLE_ROLES.filter((r) => hasRole(role, r));
}

export const INVITE_TTLS = ['1d', '7d', '30d', 'never'] as const;
export type InviteTtl = (typeof INVITE_TTLS)[number];
export const INVITE_TTL_LABELS: Record<InviteTtl, string> = {
  '1d': '1 день',
  '7d': '7 дней',
  '30d': '30 дней',
  never: 'Бессрочно',
};

export function ttlToExpiry(ttl: InviteTtl, now = Date.now()): Date | null {
  const days = { '1d': 1, '7d': 7, '30d': 30, never: 0 }[ttl];
  return days === 0 ? null : new Date(now + days * 24 * 60 * 60 * 1000);
}

export const createInviteLinkSchema = z.object({
  role: assignableRoleSchema.default('EDITOR'),
  ttl: z.enum(INVITE_TTLS).default('7d'),
  /** null — без ограничения */
  maxUses: z.number().int().min(1).max(10_000).nullable().default(null),
});
export type CreateInviteLinkInput = z.input<typeof createInviteLinkSchema>;

export const emailInvitesSchema = z.object({
  emails: z
    .array(emailSchema)
    .min(1, 'Укажите хотя бы один email')
    .max(20, 'Не больше 20 адресов за раз'),
  role: assignableRoleSchema.default('EDITOR'),
  message: z.string().trim().max(500).optional(),
});
export type EmailInvitesInput = z.input<typeof emailInvitesSchema>;

export const updateMemberSchema = z.object({ role: assignableRoleSchema });

export const BOARD_VISIBILITIES = ['PRIVATE', 'ORGANIZATION', 'PUBLIC_READ'] as const;
export const visibilitySchema = z.object({ visibility: z.enum(BOARD_VISIBILITIES) });
export type BoardVisibilityValue = (typeof BOARD_VISIBILITIES)[number];

export const joinBoardSchema = z.object({ token: z.string().min(32).max(256) });

/** Почему приглашение нельзя принять */
export type InviteProblem = 'revoked' | 'expired' | 'exhausted' | 'wrong_board' | 'wrong_email';

export const INVITE_PROBLEM_TEXT: Record<InviteProblem, string> = {
  revoked: 'Приглашение отозвано',
  expired: 'Срок действия приглашения истёк',
  exhausted: 'Ссылка уже использована максимальное число раз',
  wrong_board: 'Приглашение относится к другой доске',
  wrong_email:
    'Приглашение отправлено на другой email. Войдите в аккаунт, на который пришло письмо',
};

export interface InviteLike {
  boardId: string | null;
  email: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
  revokedAt: Date | null;
}

/**
 * Проверка приглашения. Чистая функция — одна и та же логика на странице
 * предпросмотра и при принятии (а там ещё атомарная проверка в БД).
 * userEmail = null — пользователь не вошёл (проверку адреса откладываем до входа).
 */
export function inviteProblem(
  invite: InviteLike,
  ctx: { boardId: string; userEmail: string | null; now?: Date },
): InviteProblem | null {
  const now = ctx.now ?? new Date();
  if (invite.boardId !== ctx.boardId) return 'wrong_board';
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return 'exhausted';
  if (invite.email && ctx.userEmail && invite.email.toLowerCase() !== ctx.userEmail.toLowerCase()) {
    return 'wrong_email';
  }
  return null;
}

// ─── DTO ───

export interface BoardMemberDto {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: BoardRole;
  isOwner: boolean;
  isYou: boolean;
  lastVisitedAt: string | null;
}

export interface InviteDto {
  id: string;
  role: BoardRole;
  /** null — ссылка-приглашение; иначе адресное приглашение по email */
  email: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  createdAt: string;
  createdByName: string | null;
}

export interface SharingStateDto {
  boardId: string;
  title: string;
  visibility: BoardVisibilityValue;
  /** Доска в организации — доступен режим «вся организация» */
  inOrganization: boolean;
  /** Организация разрешает публичные доски */
  publicAllowed: boolean;
  yourRole: BoardRole;
  grantableRoles: AssignableRole[];
  canManage: boolean;
  members: BoardMemberDto[];
  /** Активные приглашения (только тем, кто может делиться) */
  invites: InviteDto[];
}

export interface CreatedInviteLinkDto extends InviteDto {
  /** Полная ссылка — показывается один раз: в БД хранится только хеш токена */
  url: string;
}

export interface EmailInviteResultDto {
  email: string;
  status: 'sent' | 'already_member' | 'failed';
}
