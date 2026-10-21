import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { getSharingState } from '@/services/members';

/** GET /api/boards/:id/sharing — участники, приглашения, видимость (для ShareDialog) */
export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    return NextResponse.json(await getSharingState(user, id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);
