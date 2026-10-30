import { prisma } from '@prostor/db';
import { withErrorHandling } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import { requireBoardAccess } from '@/services/boards';

/**
 * GET /api/boards/:id/state — сохранённое состояние Yjs (превью доски на дашборде
 * рисуется в браузере тем же рендером, что и экспорт в PNG).
 * Адрес содержит ?v=<lastActivityAt>, поэтому ответ можно кэшировать надолго.
 */
export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await getSessionUser();
    await requireBoardAccess(id, user?.id ?? null, 'view');
    const row = await prisma.boardDocument.findUnique({
      where: { boardId: id },
      select: { state: true },
    });
    return new Response(row ? Buffer.from(row.state) : new Uint8Array(), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  },
);
