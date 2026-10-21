import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@prostor/db';
import {
  emailDomain,
  slugify,
  type OrgDetailsDto,
  type OrgRole,
  type OrgSummaryDto,
  type UpdateOrgInput,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { publishControl } from '@/lib/realtime';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';

const MANAGERS: readonly OrgRole[] = ['OWNER', 'ADMIN'];

async function membership(orgId: string, userId: string): Promise<OrgRole | null> {
  const m = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

/** Участник организации; manage — только OWNER/ADMIN. Чужой организации «не существует» (404) */
export async function requireOrgRole(orgId: string, userId: string, manage = false): Promise<OrgRole> {
  const role = await membership(orgId, userId);
  if (!role) throw new ApiError(404, 'not_found', 'Организация не найдена');
  if (manage && !MANAGERS.includes(role)) throw new ApiError(403, 'forbidden', 'Нужны права администратора организации');
  return role;
}

export async function listMyOrgs(userId: string): Promise<OrgSummaryDto[]> {
  const rows = await prisma.orgMember.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      org: {
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { members: true, boards: { where: { deletedAt: null } } } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.org.id,
    name: r.org.name,
    slug: r.org.slug,
    role: r.role,
    memberCount: r.org._count.members,
    boardCount: r.org._count.boards,
  }));
}

export async function createOrg(user: SessionUser, name: string): Promise<{ id: string; slug: string }> {
  const count = await prisma.orgMember.count({ where: { userId: user.id, role: 'OWNER' } });
  if (count >= 20) throw new ApiError(429, 'too_many', 'Можно владеть не более чем 20 организациями');
  // Уникальный slug: из названия + короткий случайный хвост
  const slug = `${slugify(name)}-${randomBytes(3).toString('hex')}`;
  const org = await prisma.organization.create({
    data: { name, slug, members: { create: { userId: user.id, role: 'OWNER' } } },
    select: { id: true, slug: true },
  });
  await audit({ action: 'org.create', actorId: user.id, orgId: org.id, metadata: { name } });
  return org;
}

export async function getOrg(orgId: string, user: SessionUser): Promise<OrgDetailsDto> {
  const role = await requireOrgRole(orgId, user.id);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      allowExport: true,
      allowCopy: true,
      allowDeleteOthers: true,
      allowPublicBoards: true,
      guestCanVote: true,
      guestCanUseTimer: true,
      require2fa: true,
      allowedEmailDomains: true,
      _count: { select: { boards: { where: { deletedAt: null } } } },
      members: {
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true, twoFactorEnabled: true } },
        },
      },
    },
  });
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    role,
    memberCount: org.members.length,
    boardCount: org._count.boards,
    canManage: MANAGERS.includes(role),
    isOwner: role === 'OWNER',
    allowExport: org.allowExport,
    allowCopy: org.allowCopy,
    allowDeleteOthers: org.allowDeleteOthers,
    allowPublicBoards: org.allowPublicBoards,
    guestCanVote: org.guestCanVote,
    guestCanUseTimer: org.guestCanUseTimer,
    require2fa: org.require2fa,
    allowedEmailDomains: org.allowedEmailDomains,
    members: org.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      twoFactorEnabled: m.user.twoFactorEnabled,
      isYou: m.user.id === user.id,
      joinedAt: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Политики меняют права на всех досках организации: открытые подключения
 * должны пересчитать роль и политику сразу, а не при следующем входе.
 */
async function notifyOrgBoards(orgId: string): Promise<void> {
  const boards = await prisma.board.findMany({ where: { orgId, deletedAt: null }, select: { id: true }, take: 5_000 });
  await Promise.all(boards.map((b) => publishControl({ type: 'access-changed', boardId: b.id })));
}

const POLICY_KEYS = [
  'allowExport',
  'allowCopy',
  'allowDeleteOthers',
  'allowPublicBoards',
  'guestCanVote',
  'guestCanUseTimer',
  'require2fa',
  'allowedEmailDomains',
] as const;

export async function updateOrg(orgId: string, user: SessionUser, input: UpdateOrgInput): Promise<void> {
  await requireOrgRole(orgId, user.id, true);
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const domains = input.allowedEmailDomains ? Array.from(new Set(input.allowedEmailDomains)) : undefined;
  await prisma.organization.update({
    where: { id: orgId },
    data: { ...input, ...(domains ? { allowedEmailDomains: domains } : {}) },
  });
  const changed = POLICY_KEYS.filter(
    (k) => input[k] !== undefined && JSON.stringify(input[k]) !== JSON.stringify(before[k]),
  );
  if (input.name !== undefined && input.name !== before.name) {
    await audit({ action: 'org.update', actorId: user.id, orgId, metadata: { name: input.name } });
  }
  if (changed.length > 0) {
    await audit({
      action: 'org.policy_change',
      actorId: user.id,
      orgId,
      metadata: Object.fromEntries(changed.map((k) => [k, input[k] ?? null])),
    });
    await notifyOrgBoards(orgId);
  }
}

export async function addOrgMember(orgId: string, user: SessionUser, email: string, role: OrgRole): Promise<void> {
  const myRole = await requireOrgRole(orgId, user.id, true);
  if (role === 'OWNER' && myRole !== 'OWNER') throw new ApiError(403, 'forbidden', 'Назначать владельцев может только владелец');
  const target = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!target) {
    throw new ApiError(404, 'user_not_found', 'Пользователь с таким email не зарегистрирован. Пригласите его на доску или настройте автоприсоединение по домену');
  }
  const existing = await membership(orgId, target.id);
  if (existing) throw new ApiError(409, 'already_member', 'Уже участник организации');
  await prisma.orgMember.create({ data: { orgId, userId: target.id, role } });
  await audit({ action: 'org.member_add', actorId: user.id, orgId, targetType: 'user', targetId: target.id, metadata: { role } });
  await notifyOrgBoards(orgId);
}

async function ownersCount(orgId: string): Promise<number> {
  return prisma.orgMember.count({ where: { orgId, role: 'OWNER' } });
}

export async function updateOrgMember(orgId: string, user: SessionUser, userId: string, role: OrgRole): Promise<void> {
  const myRole = await requireOrgRole(orgId, user.id, true);
  const current = await membership(orgId, userId);
  if (!current) throw new ApiError(404, 'not_found', 'Участник не найден');
  if ((role === 'OWNER' || current === 'OWNER') && myRole !== 'OWNER') {
    throw new ApiError(403, 'forbidden', 'Менять роль владельца может только владелец');
  }
  if (current === 'OWNER' && role !== 'OWNER' && (await ownersCount(orgId)) <= 1) {
    throw new ApiError(409, 'last_owner', 'Нельзя понизить единственного владельца');
  }
  await prisma.orgMember.update({ where: { orgId_userId: { orgId, userId } }, data: { role } });
  await audit({ action: 'org.member_role_change', actorId: user.id, orgId, targetType: 'user', targetId: userId, metadata: { from: current, to: role } });
  await notifyOrgBoards(orgId);
}

/** Удалить участника (администратор) или выйти самому */
export async function removeOrgMember(orgId: string, user: SessionUser, userId: string): Promise<void> {
  const self = userId === user.id;
  const myRole = await requireOrgRole(orgId, user.id, !self);
  const current = await membership(orgId, userId);
  if (!current) throw new ApiError(404, 'not_found', 'Участник не найден');
  if (current === 'OWNER' && !self && myRole !== 'OWNER') throw new ApiError(403, 'forbidden', 'Удалить владельца может только владелец');
  if (current === 'OWNER' && (await ownersCount(orgId)) <= 1) {
    throw new ApiError(409, 'last_owner', 'Единственный владелец не может покинуть организацию — передайте владение');
  }
  await prisma.orgMember.delete({ where: { orgId_userId: { orgId, userId } } });
  await audit({ action: 'org.member_remove', actorId: user.id, orgId, targetType: 'user', targetId: userId });
  await notifyOrgBoards(orgId);
}

/**
 * Автоприсоединение по домену почты: новый пользователь с адресом @company.ru
 * сразу становится участником организаций, где этот домен разрешён.
 */
export async function autoJoinByDomain(userId: string, email: string): Promise<void> {
  const domain = emailDomain(email);
  const orgs = await prisma.organization.findMany({
    where: { allowedEmailDomains: { has: domain } },
    select: { id: true },
  });
  for (const org of orgs) {
    await prisma.orgMember
      .create({ data: { orgId: org.id, userId, role: 'MEMBER' } })
      .then(() => audit({ action: 'org.member_add', actorId: userId, orgId: org.id, targetType: 'user', targetId: userId, metadata: { via: 'email_domain', domain } }))
      .catch(() => undefined);
  }
}

/** Организация требует 2FA, а у пользователя её нет — доступ к доскам организации закрыт */
export async function orgRequires2faFor(orgId: string | null, userId: string | null): Promise<boolean> {
  if (!orgId || !userId) return false;
  const [org, user] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { require2fa: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } }),
  ]);
  return Boolean(org?.require2fa && !user?.twoFactorEnabled);
}
