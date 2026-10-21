import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { endVoting } from '@/services/voting';

/** POST /api/voting/:id/end — завершить и показать итоги */
export const POST = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ sessionId: string }> }) => {
    const { sessionId } = await params;
    await endVoting(await requireUser(), sessionId);
    return NextResponse.json({ ok: true });
  },
);
