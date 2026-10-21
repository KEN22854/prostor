import { NextResponse } from 'next/server';
import { changePasswordSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { clientIp } from '@/lib/rate-limit';
import { requireUser } from '@/lib/session';
import { changePassword } from '@/services/profile';

/** POST /api/account/password — смена (или первая установка) пароля; гасит все сессии */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, changePasswordSchema);
  await changePassword(user, input, { ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') });
  return NextResponse.json({ ok: true });
});
