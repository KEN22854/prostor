import 'server-only';
import { prisma, type Prisma } from '@prostor/db';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditEntryDto,
} from '@prostor/shared';
import type { SessionUser } from '@/lib/session';
import { requireBoardAccess } from '@/services/boards';
import { requireOrgRole } from '@/services/orgs';

const PAGE = 50;
const MAX_EXPORT = 10_000;

export interface AuditQuery {
  /** createdAt последней записи предыдущей страницы (ISO) и её id — курсор без дубликатов */
  before?: string;
  action?: string;
  actorId?: string;
}

function isAction(value: string | undefined): value is AuditAction {
  return Boolean(value && (AUDIT_ACTIONS as readonly string[]).includes(value));
}

async function read(
  where: Prisma.AuditLogWhereInput,
  query: AuditQuery,
  take: number,
): Promise<AuditEntryDto[]> {
  const and: Prisma.AuditLogWhereInput[] = [where];
  if (isAction(query.action)) and.push({ action: query.action });
  if (query.actorId) and.push({ actorId: query.actorId });
  if (query.before) {
    const [at, id] = query.before.split('|');
    const date = new Date(at ?? '');
    if (!Number.isNaN(date.getTime())) {
      and.push({ OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: id ?? '' } }] });
    }
  }
  const rows = await prisma.auditLog.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: {
      id: true,
      createdAt: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      ip: true,
      boardId: true,
      actor: { select: { name: true, email: true } },
      board: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    action: r.action,
    actionLabel: isAction(r.action) ? AUDIT_ACTION_LABELS[r.action] : r.action,
    actorName: r.actor?.name ?? null,
    actorEmail: r.actor?.email ?? null,
    boardId: r.boardId,
    boardTitle: r.board?.title ?? null,
    targetType: r.targetType,
    targetId: r.targetId,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    ip: r.ip,
  }));
}

/** Журнал организации: её события и события её досок (администраторам) */
export async function orgAudit(
  user: SessionUser,
  orgId: string,
  query: AuditQuery,
  exportAll = false,
): Promise<AuditEntryDto[]> {
  await requireOrgRole(orgId, user.id, true);
  return read({ OR: [{ orgId }, { board: { orgId } }] }, query, exportAll ? MAX_EXPORT : PAGE);
}

/** Журнал доски (владельцу) */
export async function boardAudit(
  user: SessionUser,
  boardId: string,
  query: AuditQuery,
  exportAll = false,
): Promise<AuditEntryDto[]> {
  await requireBoardAccess(boardId, user.id, 'manage');
  return read({ boardId }, query, exportAll ? MAX_EXPORT : PAGE);
}

/** CSV для выгрузки (Excel открывает UTF-8 с BOM и разделителем «;») */
export function auditToCsv(entries: readonly AuditEntryDto[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    // Защита от CSV-инъекций: формулы в начале ячейки экранируем
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = [
    'Время (UTC)',
    'Действие',
    'Код',
    'Кто',
    'Email',
    'Доска',
    'Объект',
    'Подробности',
    'IP',
  ];
  const lines = entries.map((e) =>
    [
      e.createdAt,
      e.actionLabel,
      e.action,
      e.actorName,
      e.actorEmail,
      e.boardTitle,
      e.targetId ? `${e.targetType ?? ''}:${e.targetId}` : '',
      e.metadata,
      e.ip,
    ]
      .map(cell)
      .join(';'),
  );
  return `﻿${[header.map(cell).join(';'), ...lines].join('\r\n')}`;
}
