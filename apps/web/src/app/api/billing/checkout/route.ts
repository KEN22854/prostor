import { NextResponse } from 'next/server';
import { checkoutSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { checkout } from '@/services/billing';

/** POST /api/billing/checkout { plan, months, provider?, orgId? } → ссылка на оплату */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, checkoutSchema);
  return NextResponse.json(await checkout(user, input), { status: 201 });
});
