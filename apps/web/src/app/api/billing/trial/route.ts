import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { startTrial } from '@/services/billing';

/** POST /api/billing/trial — пробный Pro на 14 дней (один раз) */
export const POST = withErrorHandling(async () => {
  const user = await requireUser();
  await startTrial(user);
  return NextResponse.json({ ok: true });
});
