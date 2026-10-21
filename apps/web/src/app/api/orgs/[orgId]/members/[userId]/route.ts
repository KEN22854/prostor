import { NextResponse } from 'next/server';
import { updateOrgMemberSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { removeOrgMember, updateOrgMember } from '@/services/orgs';

interface Ctx {
  params: Promise<{ orgId: string; userId: string }>;
}

/** PATCH /api/orgs/:id/members/:userId — роль участника */
export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { orgId, userId } = await params;
  const user = await requireUser();
  const { role } = await parseJson(req, updateOrgMemberSchema);
  await updateOrgMember(orgId, user, userId, role);
  return NextResponse.json({ ok: true });
});

/** DELETE /api/orgs/:id/members/:userId — удалить участника или выйти самому */
export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { orgId, userId } = await params;
  await removeOrgMember(orgId, await requireUser(), userId);
  return new NextResponse(null, { status: 204 });
});
