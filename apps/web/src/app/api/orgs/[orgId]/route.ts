import { NextResponse } from 'next/server';
import { updateOrgSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { getOrg, updateOrg } from '@/services/orgs';

interface Ctx {
  params: Promise<{ orgId: string }>;
}

/** GET /api/orgs/:id — настройки, политики и участники */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { orgId } = await params;
  return NextResponse.json(await getOrg(orgId, await requireUser()), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

/** PATCH /api/orgs/:id — название и политики (администраторы) */
export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { orgId } = await params;
  const user = await requireUser();
  await updateOrg(orgId, user, await parseJson(req, updateOrgSchema));
  return NextResponse.json({ ok: true });
});
