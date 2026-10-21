import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { getVersionState } from '@/services/versions';

/** GET /api/boards/:id/versions/:versionId — Yjs-состояние версии для просмотра */
export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) => {
    const { id, versionId } = await params;
    const user = await requireUser();
    const state = await getVersionState(user, id, versionId);
    return new NextResponse(new Uint8Array(state), {
      headers: {
        'Content-Type': 'application/octet-stream',
        // Версии неизменяемы, но доступ к ним может быть отозван — кеш только приватный и короткий
        'Cache-Control': 'private, max-age=300',
      },
    });
  },
);
