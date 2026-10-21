import { NextResponse } from 'next/server';
import { apiCreateBoardSchema, listBoardsQuerySchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireApiUser } from '@/services/api-keys';
import { createBoard, listBoards } from '@/services/boards';
import { apiGetBoard } from '@/services/api-v1';

/** GET /api/v1/boards?q=… — доски, доступные владельцу ключа */
export const GET = withErrorHandling(async (req: Request) => {
  const user = await requireApiUser(req, 'read');
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const boards = await listBoards(user, listBoardsQuerySchema.parse(params));
  return NextResponse.json({
    boards: boards.map((b) => ({
      id: b.id,
      title: b.title,
      role: b.role,
      objectCount: b.objectCount,
      createdAt: b.createdAt,
      lastActivityAt: b.lastActivityAt,
    })),
  });
});

/** POST /api/v1/boards { title } — новая пустая доска */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireApiUser(req, 'write');
  const { title } = await parseJson(req, apiCreateBoardSchema);
  const { id } = await createBoard(user, { title });
  return NextResponse.json(await apiGetBoard(user, id), { status: 201 });
});
