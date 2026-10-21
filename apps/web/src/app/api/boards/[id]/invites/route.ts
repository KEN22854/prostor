import { NextResponse } from 'next/server';
import { createInviteLinkSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { createInviteLink } from '@/services/invites';

/**
 * POST /api/boards/:id/invites — ссылка-приглашение (роль, срок, лимит).
 * Полная ссылка в ответе показывается один раз: в БД хранится только хеш токена.
 */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const input = await parseJson(req, createInviteLinkSchema);
    return NextResponse.json(await createInviteLink(user, id, input), {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);
