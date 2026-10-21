import { NextResponse } from 'next/server';
import { createFolderSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { createFolder, listFolders } from '@/services/folders';

/** GET /api/folders?org=… — дерево папок рабочего пространства (без org — личные) */
export const GET = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const org = new URL(req.url).searchParams.get('org');
  return NextResponse.json(
    { folders: await listFolders(user, org || null) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

/** POST /api/folders — новая папка */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, createFolderSchema);
  return NextResponse.json(await createFolder(user, input), { status: 201 });
});
