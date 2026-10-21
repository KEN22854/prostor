import { NextResponse } from 'next/server';
import { updateBoardSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { getSessionUser, requireUser } from '@/lib/session';
import { deleteBoard, requireBoardAccess, updateBoard } from '@/services/boards';

interface Ctx {
  params: Promise<{ id: string }>;
}

/** GET /api/boards/:id — метаданные и роль (доступно анонимно для публичных досок) */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await getSessionUser();
  const access = await requireBoardAccess(id, user?.id ?? null, 'view');
  return NextResponse.json({
    id: access.boardId,
    title: access.title,
    role: access.role,
    visibility: access.visibility,
    policy: access.policy,
  });
});

/** PATCH /api/boards/:id — переименование / описание */
export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  const input = await parseJson(req, updateBoardSchema);
  await updateBoard(user, id, input);
  return NextResponse.json({ ok: true });
});

/** DELETE /api/boards/:id — в корзину (только владелец) */
export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  await deleteBoard(user, id);
  return new NextResponse(null, { status: 204 });
});
