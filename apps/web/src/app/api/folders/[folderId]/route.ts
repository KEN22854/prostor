import { NextResponse } from 'next/server';
import { updateFolderSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { deleteFolder, updateFolder } from '@/services/folders';

interface Ctx {
  params: Promise<{ folderId: string }>;
}

/** PATCH /api/folders/:id — переименовать / переместить */
export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { folderId } = await params;
  const user = await requireUser();
  await updateFolder(user, folderId, await parseJson(req, updateFolderSchema));
  return NextResponse.json({ ok: true });
});

/** DELETE /api/folders/:id — удалить папку с подпапками (доски уходят в корень) */
export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { folderId } = await params;
  await deleteFolder(await requireUser(), folderId);
  return new NextResponse(null, { status: 204 });
});
