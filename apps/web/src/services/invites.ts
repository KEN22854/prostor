import 'server-only';
import { prisma, type Invite } from '@prostor/db';
import {
  INVITE_PROBLEM_TEXT,
  ROLE_LABELS,
  createInviteLinkSchema,
  emailInvitesSchema,
  grantableRoles,
  hasRole,
  inviteProblem,
  ttlToExpiry,
  type BoardRole,
  type CreateInviteLinkInput,
  type CreatedInviteLinkDto,
  type EmailInviteResultDto,
  type EmailInvitesInput,
  type InviteDto,
  type InviteProblem,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { boardInviteEmail } from '@/lib/email-templates';
import { env } from '@/lib/env';
import { sendMail } from '@/lib/mail';
import { rateLimit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/session';
import { generateToken, hashToken } from '@/lib/tokens';
import { audit } from '@/services/audit';
import { requireBoardAccess } from '@/services/boards';

/** Адресное приглашение живёт 14 дней и принимается один раз */
const EMAIL_INVITE_DAYS = 14;

export function joinUrl(boardId: string, token: string): string {
  const url = new URL(`/board/${boardId}/join`, env().APP_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

export function toInviteDto(
  invite: Invite & { createdBy?: { name: string | null } | null },
): InviteDto {
  return {
    id: invite.id,
    role: invite.role,
    email: invite.email,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    maxUses: invite.maxUses,
    uses: invite.uses,
    createdAt: invite.createdAt.toISOString(),
    createdByName: invite.createdBy?.name ?? null,
  };
}

/** Выдать роль можно только не выше своей — редактор не сделает никого владельцем */
function assertCanGrant(yourRole: BoardRole, role: BoardRole): void {
  if (!grantableRoles(yourRole).includes(role as never)) {
    throw new ApiError(403, 'role_not_allowed', 'Нельзя выдать роль выше своей');
  }
}

/** Ссылка-приглашение. Сам токен возвращается один раз — в БД только SHA-256 */
export async function createInviteLink(
  user: SessionUser,
  boardId: string,
  raw: CreateInviteLinkInput,
): Promise<CreatedInviteLinkDto> {
  const input = createInviteLinkSchema.parse(raw);
  const access = await requireBoardAccess(boardId, user.id, 'share');
  assertCanGrant(access.role, input.role);

  const token = generateToken();
  const invite = await prisma.invite.create({
    data: {
      boardId,
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: ttlToExpiry(input.ttl),
      maxUses: input.maxUses,
      createdById: user.id,
    },
    include: { createdBy: { select: { name: true } } },
  });
  await audit({
    action: 'invite.create',
    actorId: user.id,
    boardId,
    targetType: 'Invite',
    targetId: invite.id,
    metadata: { kind: 'link', role: input.role, ttl: input.ttl, maxUses: input.maxUses },
  });
  return { ...toInviteDto(invite), url: joinUrl(boardId, token) };
}

/**
 * Приглашения по email: адресные (принять может только владелец адреса),
 * одноразовые, на 14 дней. Существующим пользователям — ещё и уведомление.
 */
export async function inviteByEmail(
  user: SessionUser,
  boardId: string,
  raw: EmailInvitesInput,
): Promise<EmailInviteResultDto[]> {
  const input = emailInvitesSchema.parse(raw);
  const access = await requireBoardAccess(boardId, user.id, 'share');
  assertCanGrant(access.role, input.role);

  const limit = await rateLimit(`invite-email:${user.id}`, 50, 60 * 60);
  if (!limit.ok)
    throw new ApiError(429, 'rate_limited', 'Слишком много приглашений. Попробуйте через час');

  const emails = Array.from(new Set(input.emails));
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      email: true,
      boardMemberships: { where: { boardId }, select: { role: true } },
    },
  });
  const byEmail = new Map(existingUsers.map((u) => [u.email, u]));
  const inviterName = user.name ?? user.email ?? 'Коллега';
  const results: EmailInviteResultDto[] = [];

  for (const email of emails) {
    const existing = byEmail.get(email);
    const currentRole = existing?.boardMemberships[0]?.role;
    if (existing?.id === access.ownerId || (currentRole && hasRole(currentRole, input.role))) {
      results.push({ email, status: 'already_member' });
      continue;
    }

    const token = generateToken();
    const invite = await prisma.invite.create({
      data: {
        boardId,
        email,
        role: input.role,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + EMAIL_INVITE_DAYS * 24 * 60 * 60 * 1000),
        maxUses: 1,
        createdById: user.id,
      },
    });
    const url = joinUrl(boardId, token);
    try {
      await sendMail(
        boardInviteEmail({
          to: email,
          inviterName,
          boardTitle: access.title,
          roleLabel: ROLE_LABELS[input.role],
          url,
          message: input.message,
          expiresInDays: EMAIL_INVITE_DAYS,
        }),
      );
      if (existing) {
        await prisma.notification.create({
          data: {
            userId: existing.id,
            type: 'INVITE',
            payload: {
              boardId,
              boardTitle: access.title,
              inviteId: invite.id,
              actorId: user.id,
              actorName: user.name ?? user.email ?? null,
              role: input.role,
            },
          },
        });
      }
      results.push({ email, status: 'sent' });
      await audit({
        action: 'invite.create',
        actorId: user.id,
        boardId,
        targetType: 'Invite',
        targetId: invite.id,
        metadata: { kind: 'email', role: input.role },
      });
    } catch (error: unknown) {
      console.error('[invites] email failed', email, error);
      // Письмо не ушло — приглашение не должно висеть «рабочим» без получателя
      await prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
      results.push({ email, status: 'failed' });
    }
  }
  return results;
}

export async function revokeInvite(
  user: SessionUser,
  boardId: string,
  inviteId: string,
): Promise<void> {
  await requireBoardAccess(boardId, user.id, 'share');
  const { count } = await prisma.invite.updateMany({
    where: { id: inviteId, boardId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw new ApiError(404, 'not_found', 'Приглашение не найдено');
  await audit({
    action: 'invite.revoke',
    actorId: user.id,
    boardId,
    targetType: 'Invite',
    targetId: inviteId,
  });
}

/** Активные приглашения доски (истёкшие, отозванные и исчерпанные — скрыты) */
export async function listActiveInvites(boardId: string): Promise<InviteDto[]> {
  const invites = await prisma.invite.findMany({
    where: {
      boardId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return invites.filter((i) => i.maxUses === null || i.uses < i.maxUses).map(toInviteDto);
}

export interface InvitePreview {
  boardTitle: string;
  inviterName: string | null;
  role: BoardRole;
  email: string | null;
  problem: InviteProblem | null;
}

/** Для страницы /board/:id/join: что за приглашение и можно ли его принять */
export async function previewInvite(
  boardId: string,
  token: string,
  userEmail: string | null,
): Promise<InvitePreview | null> {
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      board: { select: { title: true, deletedAt: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!invite || !invite.board || invite.board.deletedAt) return null;
  return {
    boardTitle: invite.board.title,
    inviterName: invite.createdBy.name,
    role: invite.role,
    email: invite.email,
    problem: inviteProblem(invite, { boardId, userEmail }),
  };
}

const PROBLEM_STATUS: Record<InviteProblem, number> = {
  revoked: 410,
  expired: 410,
  exhausted: 410,
  wrong_board: 404,
  wrong_email: 403,
};

/**
 * Принятие приглашения. Всё в одной транзакции:
 *  - проверка (inviteProblem) и атомарное списание использования — две
 *    одновременные попытки по одноразовой ссылке не пройдут обе;
 *  - роль не понижается: редактор, открывший ссылку «для читателей», остаётся редактором;
 *  - если доступ уже не ниже, использование не списывается.
 */
export async function acceptInvite(
  user: SessionUser,
  boardId: string,
  token: string,
): Promise<{ role: BoardRole }> {
  const result = await prisma.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invite) throw new ApiError(404, 'invite_not_found', 'Приглашение не найдено');
    const problem = inviteProblem(invite, { boardId, userEmail: user.email });
    if (problem) throw new ApiError(PROBLEM_STATUS[problem], problem, INVITE_PROBLEM_TEXT[problem]);

    const board = await tx.board.findUnique({
      where: { id: boardId },
      select: { ownerId: true, deletedAt: true },
    });
    if (!board || board.deletedAt) throw new ApiError(404, 'not_found', 'Доска удалена');
    if (board.ownerId === user.id)
      return { role: 'OWNER' as BoardRole, changed: false, inviteId: invite.id };

    const member = await tx.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: user.id } },
      select: { role: true },
    });
    if (member && hasRole(member.role, invite.role)) {
      return { role: member.role, changed: false, inviteId: invite.id };
    }

    const claimed = await tx.invite.updateMany({
      where: {
        id: invite.id,
        revokedAt: null,
        ...(invite.maxUses !== null ? { uses: { lt: invite.maxUses } } : {}),
      },
      data: { uses: { increment: 1 }, ...(invite.email ? { acceptedAt: new Date() } : {}) },
    });
    if (claimed.count === 0) throw new ApiError(410, 'exhausted', INVITE_PROBLEM_TEXT.exhausted);

    await tx.boardMember.upsert({
      where: { boardId_userId: { boardId, userId: user.id } },
      create: {
        boardId,
        userId: user.id,
        role: invite.role,
        inviteId: invite.id,
        lastVisitedAt: new Date(),
      },
      update: { role: invite.role, inviteId: invite.id },
    });
    return { role: invite.role, changed: true, inviteId: invite.id };
  });

  if (result.changed) {
    await audit({
      action: 'invite.accept',
      actorId: user.id,
      boardId,
      targetType: 'Invite',
      targetId: result.inviteId,
    });
    await audit({
      action: 'member.add',
      actorId: user.id,
      boardId,
      targetType: 'User',
      targetId: user.id,
      metadata: { role: result.role },
    });
  }
  return { role: result.role };
}
