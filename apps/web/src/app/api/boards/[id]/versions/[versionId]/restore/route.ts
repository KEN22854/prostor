import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { clientIp } from '@/lib/rate-limit';
import { requireUser } from '@/lib/session';
import { recordRestore } from '@/services/versions';

/** POST /api/boards/:id/versions/:versionId/restore — проверка прав и аудит отката */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) => {
    const { id, versionId } = await params;
    const user = await requireUser();
    await recordRestore(user, id, versionId, { ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') });
    return new NextResponse(null, { status: 204 });
  },
);
