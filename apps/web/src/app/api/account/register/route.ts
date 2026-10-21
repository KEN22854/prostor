import { NextResponse } from 'next/server';
import { registerSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { clientIp } from '@/lib/rate-limit';
import { registerUser } from '@/services/account';

/** POST /api/account/register — создание аккаунта; вход выполняет клиент через signIn() */
export const POST = withErrorHandling(async (req: Request) => {
  const input = await parseJson(req, registerSchema);
  const user = await registerUser(input, {
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ id: user.id }, { status: 201 });
});
