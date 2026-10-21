import { NextResponse } from 'next/server';
import { updateCommentSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { deleteComment, updateComment } from '@/services/comments';

interface Ctx {
  params: Promise<{ commentId: string }>;
}

/** PATCH /api/comments/:id — правка своего комментария */
export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { commentId } = await params;
  const user = await requireUser();
  const { body } = await parseJson(req, updateCommentSchema);
  await updateComment(user, commentId, body);
  return NextResponse.json({ ok: true });
});

/** DELETE /api/comments/:id — автор или владелец доски */
export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { commentId } = await params;
  const user = await requireUser();
  await deleteComment(user, commentId);
  return new NextResponse(null, { status: 204 });
});
