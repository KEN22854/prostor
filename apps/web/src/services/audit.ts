import 'server-only';
import { prisma, type Prisma } from '@prostor/db';
import type { AuditAction } from '@prostor/shared';

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  orgId?: string | null;
  boardId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Запись в аудит-лог. Ошибка записи не должна ломать основное действие
 * (вход, сохранение доски), поэтому исключения логируются и глотаются.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        orgId: entry.orgId ?? null,
        boardId: entry.boardId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? {},
        ip: entry.ip ?? null,
        userAgent: entry.userAgent?.slice(0, 512) ?? null,
      },
    });
  } catch (error: unknown) {
    console.error('[audit] failed to write', entry.action, error);
  }
}
