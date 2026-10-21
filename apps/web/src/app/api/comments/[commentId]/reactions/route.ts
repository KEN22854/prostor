import { NextResponse } from 'next/server';
import { reactionSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { toggleReaction } from '@/services/comments';

/** POST /api/comments/:id/reactions — поставить/снять реакцию */
export const POST = withErrorHandling(async (req: Request, { params }: { params: Promise<{ commentId: string }> }) => {
  const { commentId } = await params;
  const user = await requireUser();
  const { emoji } = await parseJson(req, reactionSchema);
  await toggleReaction(user, commentId, emoji);
  return NextResponse.json({ ok: true });
});
