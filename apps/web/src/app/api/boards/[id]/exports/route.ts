import { NextResponse } from 'next/server';
import { exportRequestSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { clientIp } from '@/lib/rate-limit';
import { getSessionUser } from '@/lib/session';
import { requireBoardAccess } from '@/services/boards';
import { audit } from '@/services/audit';

/**
 * POST /api/boards/:id/exports — «разрешение» на экспорт.
 * Сам файл собирается в браузере (данные у клиента уже есть), но запрет
 * организации на экспорт и аудит должны быть на сервере, а не только в UI.
 */
export const POST = withErrorHandling(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const user = await getSessionUser();
  const input = await parseJson(req, exportRequestSchema);
  await requireBoardAccess(id, user?.id ?? null, 'export');
  await audit({
    action: 'board.export',
    actorId: user?.id ?? null,
    boardId: id,
    metadata: input,
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
  });
  return new NextResponse(null, { status: 204 });
});
