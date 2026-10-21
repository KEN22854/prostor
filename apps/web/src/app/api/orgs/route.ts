import { NextResponse } from 'next/server';
import { createOrgSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { createOrg, listMyOrgs } from '@/services/orgs';

/** GET /api/orgs — мои организации */
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return NextResponse.json({ orgs: await listMyOrgs(user.id) });
});

/** POST /api/orgs — создать организацию (создатель — владелец) */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const { name } = await parseJson(req, createOrgSchema);
  return NextResponse.json(await createOrg(user, name), { status: 201 });
});
