import { NextResponse } from 'next/server';
import { updateMemberSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { removeMember, updateMemberRole } from '@/services/members';

interface Ctx {
  params: Promise<{ id: string; userId: string }>;
}

/** PATCH /api/boards/:id/members/:userId — сменить роль (только владелец) */
export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { id, userId } = await params;
  const user = await requireUser();
  const { role } = await parseJson(req, updateMemberSchema);
  await updateMemberRole(user, id, userId, role);
  return NextResponse.json({ ok: true });
});

/** DELETE /api/boards/:id/members/:userId — удалить участника (владелец) или выйти самому */
export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { id, userId } = await params;
  await removeMember(await requireUser(), id, userId);
  return new NextResponse(null, { status: 204 });
});
