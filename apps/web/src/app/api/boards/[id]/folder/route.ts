import { NextResponse } from 'next/server';
import { moveBoardSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { moveBoard } from '@/services/folders';

/** PATCH /api/boards/:id/folder — переместить доску в папку ({ folderId: null } — в корень) */
export const PATCH = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const { folderId } = await parseJson(req, moveBoardSchema);
    await moveBoard(user, id, folderId);
    return NextResponse.json({ ok: true });
  },
);
