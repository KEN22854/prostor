import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { billingOverview } from '@/services/billing';

/** GET /api/billing — тариф, использование лимитов, история платежей */
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return NextResponse.json(await billingOverview(user));
});
