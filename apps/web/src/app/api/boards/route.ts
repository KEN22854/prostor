import { NextResponse } from 'next/server';
import { createBoardSchema, listBoardsQuerySchema } from '@prostor/shared';
import { ApiError, parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { createBoard, listBoards } from '@/services/boards';

/** GET /api/boards?q=&sort=recent|name|created&filter=all|mine|shared|favorites */
export const GET = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = listBoardsQuerySchema.safeParse(params);
  if (!query.success) throw new ApiError(400, 'invalid_query', 'Некорректные параметры запроса');
  return NextResponse.json({ boards: await listBoards(user, query.data) });
});

/** POST /api/boards — создать доску */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, createBoardSchema);
  const board = await createBoard(user, input);
  return NextResponse.json(board, { status: 201 });
});
