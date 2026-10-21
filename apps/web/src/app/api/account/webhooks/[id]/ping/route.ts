import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { pingWebhook } from '@/services/webhooks';

/** Тестовая доставка события ping */
export const POST = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await pingWebhook(await requireUser(), id);
    return NextResponse.json({ queued: true }, { status: 202 });
  },
);
