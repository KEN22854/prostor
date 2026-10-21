import { z } from 'zod';
import { emailSchema } from './auth';
import { roleSchema, type BoardRole } from './permissions';

/** Роли в организации — дублируют enum OrgRole из Prisma (shared не зависит от @prisma/client) */
export const ORG_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export const orgRoleSchema = z.enum(ORG_ROLES);
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Владелец',
  ADMIN: 'Администратор',
  MEMBER: 'Участник',
};

const orgNameSchema = z.string().trim().min(2, 'Минимум 2 символа').max(100);

export const createOrgSchema = z.object({ name: orgNameSchema });

/** Домен без схемы и @: company.ru */
const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i, 'Некорректный домен');

/** Политики организации (проверяются и в REST API, и на WS-сервере) */
export const orgPolicyUpdateSchema = z.object({
  allowExport: z.boolean(),
  allowCopy: z.boolean(),
  allowDeleteOthers: z.boolean(),
  allowPublicBoards: z.boolean(),
  guestCanVote: z.boolean(),
  guestCanUseTimer: z.boolean(),
  require2fa: z.boolean(),
  /** Пользователи с почтой этих доменов вступают в организацию автоматически */
  allowedEmailDomains: z.array(domainSchema).max(20),
});
export type OrgPolicyUpdate = z.infer<typeof orgPolicyUpdateSchema>;

export const updateOrgSchema = z
  .object({ name: orgNameSchema.optional() })
  .merge(orgPolicyUpdateSchema.partial());
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const addOrgMemberSchema = z.object({
  email: emailSchema,
  role: orgRoleSchema.default('MEMBER'),
});
export const updateOrgMemberSchema = z.object({ role: orgRoleSchema });

export interface OrgSummaryDto {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  memberCount: number;
  boardCount: number;
}

export interface OrgMemberDto {
  userId: string;
  name: string | null;
  email: string;
  role: OrgRole;
  twoFactorEnabled: boolean;
  isYou: boolean;
  joinedAt: string;
}

export interface OrgDetailsDto extends OrgSummaryDto, OrgPolicyUpdate {
  canManage: boolean;
  /** Только владелец назначает владельцев и удаляет организацию */
  isOwner: boolean;
  members: OrgMemberDto[];
}

/** Домен email пользователя */
export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/** slug из названия: транслитерация кириллицы, латиница, цифры и дефисы */
export function slugify(name: string): string {
  const map: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };
  return (
    name
      .toLowerCase()
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org'
  );
}

// ───────────────────────── Папки ─────────────────────────

const folderNameSchema = z.string().trim().min(1, 'Введите название').max(100);

export const createFolderSchema = z.object({
  name: folderNameSchema,
  parentId: z.string().max(64).nullable().default(null),
  /** Папка верхнего уровня в организации (у вложенных — организация родителя) */
  orgId: z.string().max(64).nullable().default(null),
});
export type CreateFolderInput = z.input<typeof createFolderSchema>;

export const updateFolderSchema = z
  .object({
    name: folderNameSchema.optional(),
    /** Переместить: null — в корень */
    parentId: z.string().max(64).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined, 'Нечего обновлять');

export const folderMemberSchema = z.object({
  email: emailSchema,
  role: roleSchema.exclude(['OWNER']).default('EDITOR'),
});
export const updateFolderMemberSchema = z.object({ role: roleSchema.exclude(['OWNER']) });

export const moveBoardSchema = z.object({ folderId: z.string().max(64).nullable() });

export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
  orgId: string | null;
  path: string;
  role: BoardRole;
  boardCount: number;
}

export interface FolderMemberDto {
  userId: string;
  name: string | null;
  email: string;
  role: BoardRole;
  /** Права унаследованы от родительской папки — менять здесь нельзя */
  inheritedFrom: string | null;
}
