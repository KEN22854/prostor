import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { revokeInvite } from '@/services/invites';

/** DELETE /api/boards/:id/invites/:inviteId — отозвать приглашение */
export const DELETE = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) => {
    const { id, inviteId } = await params;
    await revokeInvite(await requireUser(), id, inviteId);
    return new NextResponse(null, { status: 204 });
  },
);
