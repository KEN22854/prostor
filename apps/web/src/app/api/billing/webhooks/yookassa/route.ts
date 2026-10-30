import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { handleYookassaWebhook } from '@/services/billing';

/** POST /api/billing/webhooks/yookassa — уведомление ЮKassa (статус перепроверяется в API) */
export const POST = withErrorHandling(async (req: Request) => {
  await handleYookassaWebhook(await req.json());
  return NextResponse.json({ ok: true });
});
