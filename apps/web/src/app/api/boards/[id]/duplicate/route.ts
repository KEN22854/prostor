import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { duplicateBoard } from '@/services/boards';

/** POST /api/boards/:id/duplicate — копия доски с содержимым */
export const POST = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    return NextResponse.json(await duplicateBoard(user, id), { status: 201 });
  },
);
