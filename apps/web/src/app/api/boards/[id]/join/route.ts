import { NextResponse } from 'next/server';
import { joinBoardSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { ApiError } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { acceptInvite } from '@/services/invites';

/** POST /api/boards/:id/join — принять приглашение (нужен вход) */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    // Перебор токенов бессмыслен (256 бит), но лишние запросы к БД ограничим
    const limit = await rateLimit(`join:${user.id}:${clientIp(req.headers)}`, 30, 10 * 60);
    if (!limit.ok) throw new ApiError(429, 'rate_limited', 'Слишком много попыток');
    const { token } = await parseJson(req, joinBoardSchema);
    return NextResponse.json(await acceptInvite(user, id, token));
  },
);
