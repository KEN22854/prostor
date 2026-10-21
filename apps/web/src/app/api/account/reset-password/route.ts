import { NextResponse } from 'next/server';
import { resetPasswordSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { clientIp } from '@/lib/rate-limit';
import { resetPassword } from '@/services/account';

/** POST /api/account/reset-password — новый пароль по токену из письма */
export const POST = withErrorHandling(async (req: Request) => {
  const input = await parseJson(req, resetPasswordSchema);
  await resetPassword(input, {
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true });
});
