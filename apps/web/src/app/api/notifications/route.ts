import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { listNotifications } from '@/services/notifications';

/** GET /api/notifications — последние уведомления и число непрочитанных */
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return NextResponse.json(await listNotifications(user.id), { headers: { 'Cache-Control': 'no-store' } });
});
