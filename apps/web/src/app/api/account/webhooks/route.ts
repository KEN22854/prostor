import { NextResponse } from 'next/server';
import { createWebhookSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { createWebhook, listWebhooks } from '@/services/webhooks';

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return NextResponse.json({ webhooks: await listWebhooks(user) });
});

/** Новый вебхук; секрет подписи — в ответе один раз */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, createWebhookSchema);
  return NextResponse.json(await createWebhook(user, input), { status: 201 });
});
