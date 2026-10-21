import { NextResponse } from 'next/server';
import { folderMemberSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { addFolderMember, listFolderMembers } from '@/services/folders';

interface Ctx {
  params: Promise<{ folderId: string }>;
}

/** GET /api/folders/:id/members — участники (с унаследованными от родителей) */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { folderId } = await params;
  return NextResponse.json({ members: await listFolderMembers(await requireUser(), folderId) });
});

/** POST /api/folders/:id/members — открыть папку (права наследуют все доски внутри) */
export const POST = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { folderId } = await params;
  const user = await requireUser();
  const { email, role } = await parseJson(req, folderMemberSchema);
  await addFolderMember(user, folderId, email, role);
  return NextResponse.json({ ok: true }, { status: 201 });
});
