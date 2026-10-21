import { NextResponse } from 'next/server';
import { resolveThreadSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { resolveThread } from '@/services/comments';

/** POST /api/comments/:id/resolve — { resolved } для корня треда */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ commentId: string }> }) => {
    const { commentId } = await params;
    const user = await requireUser();
    const { resolved } = await parseJson(req, resolveThreadSchema);
    await resolveThread(user, commentId, resolved);
    return NextResponse.json({ ok: true });
  },
);
