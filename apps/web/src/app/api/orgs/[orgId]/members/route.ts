import { NextResponse } from 'next/server';
import { addOrgMemberSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { addOrgMember } from '@/services/orgs';

/** POST /api/orgs/:id/members — добавить зарегистрированного пользователя */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ orgId: string }> }) => {
    const { orgId } = await params;
    const user = await requireUser();
    const { email, role } = await parseJson(req, addOrgMemberSchema);
    await addOrgMember(orgId, user, email, role);
    return NextResponse.json({ ok: true }, { status: 201 });
  },
);
