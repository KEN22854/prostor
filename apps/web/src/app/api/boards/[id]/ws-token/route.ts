import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import { issueWsToken } from '@/services/boards';

/**
 * POST /api/boards/:id/ws-token — JWT для подключения к WS-серверу (5 минут).
 * Клиент запрашивает новый токен перед каждым переподключением.
 * POST, а не GET: ответ содержит секрет и не должен кешироваться.
 */
export const POST = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await getSessionUser();
    const token = await issueWsToken(user, id);
    return NextResponse.json(token, { headers: { 'Cache-Control': 'no-store' } });
  },
);
