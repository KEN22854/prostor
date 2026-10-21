import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { beginSetup, confirmSetup, disable, twoFactorStatus } from '@/services/two-factor';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup') }),
  z.object({ action: z.literal('enable'), code: z.string().trim().min(6).max(20) }),
  z.object({ action: z.literal('disable'), code: z.string().trim().min(6).max(20) }),
]);

/** GET /api/account/2fa — включена ли 2FA и сколько резервных кодов осталось */
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return NextResponse.json(await twoFactorStatus(user.id), { headers: { 'Cache-Control': 'no-store' } });
});

/**
 * POST /api/account/2fa
 *  { action: 'setup' }            → секрет и QR (ещё не включена)
 *  { action: 'enable', code }     → включить, ответ — резервные коды (показываются один раз)
 *  { action: 'disable', code }    → выключить (код из приложения или резервный)
 */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, actionSchema);
  const headers = { 'Cache-Control': 'no-store' };
  switch (input.action) {
    case 'setup':
      return NextResponse.json(await beginSetup(user), { headers });
    case 'enable':
      return NextResponse.json(await confirmSetup(user, input.code), { headers });
    case 'disable':
      await disable(user, input.code);
      return NextResponse.json({ ok: true }, { headers });
    default:
      throw new ApiError(400, 'bad_action', 'Неизвестное действие');
  }
});
