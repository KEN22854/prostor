import { NextResponse } from 'next/server';
import { startVotingSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { getSessionUser, requireUser } from '@/lib/session';
import { getVoting, startVoting } from '@/services/voting';

interface Ctx {
  params: Promise<{ id: string }>;
}

/** GET /api/boards/:id/voting — текущее голосование (или null) */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getSessionUser();
  return NextResponse.json({ voting: await getVoting(id, user?.id ?? null) }, { headers: { 'Cache-Control': 'no-store' } });
});

/** POST /api/boards/:id/voting — начать голосование (редактор) */
export const POST = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  const input = await parseJson(req, startVotingSchema);
  return NextResponse.json(await startVoting(user, id, input), { status: 201 });
});
