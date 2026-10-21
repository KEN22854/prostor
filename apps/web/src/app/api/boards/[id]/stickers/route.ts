import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { addStickerToBoard } from '@/services/stickers';

/** POST /api/boards/:id/stickers { id } — стикер из библиотеки как ассет доски */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const body = await parseJson(req, z.object({ id: z.string().max(128) }));
    return NextResponse.json(await addStickerToBoard(user, id, body.id), { status: 201 });
  },
);
