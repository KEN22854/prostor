import { NextResponse } from 'next/server';
import { castVoteSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { castVote, retractVote } from '@/services/voting';

interface Ctx {
  params: Promise<{ sessionId: string }>;
}

/** POST /api/voting/:id/votes — отдать голос за объект */
export const POST = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { sessionId } = await params;
  const user = await requireUser();
  const { elementId } = await parseJson(req, castVoteSchema);
  await castVote(user, sessionId, elementId);
  return NextResponse.json({ ok: true }, { status: 201 });
});

/** DELETE /api/voting/:id/votes — забрать один голос ({ elementId }) */
export const DELETE = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { sessionId } = await params;
  const user = await requireUser();
  const { elementId } = await parseJson(req, castVoteSchema);
  await retractVote(user, sessionId, elementId);
  return new NextResponse(null, { status: 204 });
});
