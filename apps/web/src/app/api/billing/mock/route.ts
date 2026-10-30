import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { confirmMockPayment } from '@/services/billing';

const schema = z.object({ paymentId: z.string().max(64), ok: z.boolean() });

/** POST /api/billing/mock — тестовая оплата (только при BILLING_MOCK вне production) */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const { paymentId, ok } = await parseJson(req, schema);
  await confirmMockPayment(user, paymentId, ok);
  return NextResponse.json({ ok: true });
});
