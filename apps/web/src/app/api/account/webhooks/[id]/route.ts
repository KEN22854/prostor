import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { deleteWebhook, updateWebhook } from '@/services/webhooks';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  return NextResponse.json(await updateWebhook(await requireUser(), id, body));
});

export const DELETE = withErrorHandling(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await deleteWebhook(await requireUser(), id);
  return new NextResponse(null, { status: 204 });
});
