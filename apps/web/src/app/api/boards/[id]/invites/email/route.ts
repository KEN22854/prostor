import { NextResponse } from 'next/server';
import { emailInvitesSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { inviteByEmail } from '@/services/invites';

/** POST /api/boards/:id/invites/email — приглашения по email (до 20 адресов) */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const input = await parseJson(req, emailInvitesSchema);
    return NextResponse.json({ results: await inviteByEmail(user, id, input) });
  },
);
