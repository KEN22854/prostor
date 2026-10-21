import { NextResponse } from 'next/server';
import { LIMITS, createVersionQuerySchema } from '@prostor/shared';
import { ApiError, withErrorHandling } from '@/lib/api';
import { clientIp } from '@/lib/rate-limit';
import { requireUser } from '@/lib/session';
import { createVersion, listVersions } from '@/services/versions';

interface Ctx {
  params: Promise<{ id: string }>;
}

/** GET /api/boards/:id/versions — история версий (редакторам) */
export const GET = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  return NextResponse.json(
    { versions: await listVersions(user, id) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

/**
 * POST /api/boards/:id/versions?label=…&reason=MANUAL|PRE_RESTORE
 * Тело — Y.encodeStateAsUpdate(doc) клиента (application/octet-stream).
 */
export const POST = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireUser();
  const url = new URL(req.url);
  const query = createVersionQuerySchema.safeParse({
    label: url.searchParams.get('label') ?? undefined,
    reason: url.searchParams.get('reason') ?? undefined,
  });
  if (!query.success) throw new ApiError(400, 'validation_error', 'Некорректные параметры');
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > LIMITS.maxYjsUpdateBytes)
    throw new ApiError(413, 'too_large', 'Доска слишком большая');
  const update = new Uint8Array(await req.arrayBuffer());
  const version = await createVersion(
    user,
    id,
    { update, label: query.data.label, reason: query.data.reason },
    { ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') },
  );
  return NextResponse.json(version, { status: 201 });
});
