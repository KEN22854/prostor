import { NextResponse } from 'next/server';
import { forgotPasswordSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { clientIp } from '@/lib/rate-limit';
import { requestPasswordReset } from '@/services/account';

/** POST /api/account/forgot-password — всегда 200, чтобы не раскрывать наличие email */
export const POST = withErrorHandling(async (req: Request) => {
  const input = await parseJson(req, forgotPasswordSchema);
  await requestPasswordReset(input, {
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true });
});
