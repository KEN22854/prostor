import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { templateState } from '@/services/templates';

/** GET /api/templates/:id/state — состояние Yjs шаблона (превью в галерее рисуется в браузере) */
export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const state = await templateState(user, id);
    return new Response(Buffer.from(state), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
      },
    });
  },
);
