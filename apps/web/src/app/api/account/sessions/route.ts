import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { clientIp } from '@/lib/rate-limit';
import { requireUser } from '@/lib/session';
import { signOutEverywhere } from '@/services/profile';

/** DELETE /api/account/sessions — выход на всех устройствах (включая текущее) */
export const DELETE = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  await signOutEverywhere(user, {
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
  });
  return new NextResponse(null, { status: 204 });
});
