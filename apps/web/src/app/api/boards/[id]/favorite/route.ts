import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { setFavorite } from '@/services/boards';

interface Ctx {
  params: Promise<{ id: string }>;
}

/** PUT /api/boards/:id/favorite — добавить в избранное (идемпотентно) */
export const PUT = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await setFavorite(await requireUser(), id, true);
  return new NextResponse(null, { status: 204 });
});

/** DELETE /api/boards/:id/favorite — убрать из избранного */
export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await setFavorite(await requireUser(), id, false);
  return new NextResponse(null, { status: 204 });
});
