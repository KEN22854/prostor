import { NextResponse } from 'next/server';
import { createCommentSchema } from '@prostor/shared';
import { ApiError, parseJson, withErrorHandling } from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import { getSessionUser, requireUser } from '@/lib/session';
import { createComment, listThreads } from '@/services/comments';

interface Ctx {
  params: Promise<{ id: string }>;
}

/** GET /api/boards/:id/comments — треды (видны всем, кто видит доску) */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getSessionUser();
  return NextResponse.json(
    { threads: await listThreads(id, user?.id ?? null) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

/** POST /api/boards/:id/comments — новый тред или ответ (parentId) */
export const POST = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  const limit = await rateLimit(`comments:user:${user.id}`, 120, 10 * 60);
  if (!limit.ok) throw new ApiError(429, 'rate_limited', 'Слишком много комментариев подряд');
  const input = await parseJson(req, createCommentSchema);
  return NextResponse.json(await createComment(user, id, input), { status: 201 });
});
