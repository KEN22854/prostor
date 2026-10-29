import 'server-only';
import { prisma } from '@prostor/db';
import { saveTemplateSchema, type BoardTemplateDto, type SaveTemplateInput } from '@prostor/shared';
import { ApiError } from '@/lib/api';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';
import { requireBoardAccess } from '@/services/boards';
import { requireOrgRole } from '@/services/orgs';

/** Шаблонов на пользователя / организацию — чтобы галерея оставалась галереей */
const MAX_TEMPLATES = 100;

/**
 * Свой шаблон — снимок содержимого доски (состояние Yjs). Новая доска из
 * шаблона получает копию этого состояния: все объекты, тексты, картинки
 * (ассеты остаются общими — их права проверяются по доске-владельцу).
 */
export async function saveBoardAsTemplate(
  user: SessionUser,
  boardId: string,
  input: SaveTemplateInput,
): Promise<{ id: string }> {
  const data = saveTemplateSchema.parse(input);
  const access = await requireBoardAccess(boardId, user.id, 'copy');
  const board = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    select: {
      orgId: true,
      objectCount: true,
      document: { select: { state: true, sizeBytes: true } },
    },
  });
  if (!board.document) throw new ApiError(409, 'empty_board', 'На доске пока ничего нет');
  let orgId: string | null = null;
  if (data.scope === 'org') {
    if (!board.orgId)
      throw new ApiError(
        400,
        'no_org',
        'Доска не принадлежит организации — сохраните шаблон для себя',
      );
    await requireOrgRole(board.orgId, user.id);
    orgId = board.orgId;
  }
  const count = await prisma.boardTemplate.count({
    where: orgId ? { orgId } : { ownerId: user.id, orgId: null },
  });
  if (count >= MAX_TEMPLATES)
    throw new ApiError(409, 'too_many_templates', 'Слишком много шаблонов — удалите ненужные');

  const template = await prisma.boardTemplate.create({
    data: {
      title: data.title,
      description: data.description || null,
      ownerId: user.id,
      orgId,
      state: board.document.state,
      sizeBytes: board.document.sizeBytes,
      objectCount: board.objectCount,
    },
    select: { id: true },
  });
  await audit({
    action: 'template.create',
    actorId: user.id,
    boardId,
    orgId: orgId ?? access.orgId ?? undefined,
    metadata: { templateId: template.id, scope: data.scope },
  });
  return template;
}

/** Шаблоны, доступные пользователю: свои личные и всех его организаций */
export async function listTemplates(user: SessionUser): Promise<BoardTemplateDto[]> {
  const memberships = await prisma.orgMember.findMany({
    where: { userId: user.id },
    select: { orgId: true, role: true },
  });
  const managed = new Set(
    memberships.filter((m) => m.role === 'OWNER' || m.role === 'ADMIN').map((m) => m.orgId),
  );
  const rows = await prisma.boardTemplate.findMany({
    where: {
      OR: [{ ownerId: user.id, orgId: null }, { orgId: { in: memberships.map((m) => m.orgId) } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      title: true,
      description: true,
      objectCount: true,
      createdAt: true,
      ownerId: true,
      orgId: true,
      org: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    org: r.org,
    owner: r.owner,
    objectCount: r.objectCount,
    createdAt: r.createdAt.toISOString(),
    canDelete: r.ownerId === user.id || (r.orgId !== null && managed.has(r.orgId)),
  }));
}

/** Шаблон с проверкой доступа: личный — только автору, организации — её участникам */
async function accessibleTemplate(user: SessionUser, id: string) {
  const template = await prisma.boardTemplate.findUnique({ where: { id } });
  if (!template) throw new ApiError(404, 'not_found', 'Шаблон не найден');
  if (template.orgId) {
    const member = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: template.orgId, userId: user.id } },
      select: { role: true },
    });
    if (!member) throw new ApiError(404, 'not_found', 'Шаблон не найден');
    return { template, role: member.role };
  }
  if (template.ownerId !== user.id) throw new ApiError(404, 'not_found', 'Шаблон не найден');
  return { template, role: null };
}

/** Состояние Yjs шаблона — для превью в галерее */
export async function templateState(user: SessionUser, id: string) {
  const { template } = await accessibleTemplate(user, id);
  return template.state;
}

export async function deleteTemplate(user: SessionUser, id: string): Promise<void> {
  const { template, role } = await accessibleTemplate(user, id);
  const canDelete = template.ownerId === user.id || role === 'OWNER' || role === 'ADMIN';
  if (!canDelete)
    throw new ApiError(403, 'forbidden', 'Удалить шаблон может автор или администратор');
  await prisma.boardTemplate.delete({ where: { id } });
  await audit({
    action: 'template.delete',
    actorId: user.id,
    orgId: template.orgId ?? undefined,
    metadata: { templateId: id, title: template.title },
  });
}

/** Для создания доски: состояние и число объектов шаблона */
export async function templateForBoard(user: SessionUser, id: string) {
  const { template } = await accessibleTemplate(user, id);
  return {
    state: template.state,
    sizeBytes: template.sizeBytes,
    objectCount: template.objectCount,
  };
}
