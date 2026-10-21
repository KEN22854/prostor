import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { closeVoting } from '@/services/voting';

/** POST /api/voting/:id/close — скрыть итоги */
export const POST = withErrorHandling(async (_req: Request, { params }: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await params;
  await closeVoting(await requireUser(), sessionId);
  return NextResponse.json({ ok: true });
});
