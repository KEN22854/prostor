import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { removeFolderMember } from '@/services/folders';

/** DELETE /api/folders/:id/members/:userId */
export const DELETE = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ folderId: string; userId: string }> }) => {
    const { folderId, userId } = await params;
    await removeFolderMember(await requireUser(), folderId, userId);
    return new NextResponse(null, { status: 204 });
  },
);
