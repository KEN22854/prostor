import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { handleStripeWebhook } from '@/services/billing';

/** POST /api/billing/webhooks/stripe — событие Stripe; подпись проверяется по сырому телу */
export const POST = withErrorHandling(async (req: Request) => {
  await handleStripeWebhook(await req.text(), req.headers.get('stripe-signature'));
  return NextResponse.json({ received: true });
});
