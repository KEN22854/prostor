import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { revokeApiKey } from '@/services/api-keys';

export const DELETE = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await revokeApiKey(await requireUser(), id);
    return new NextResponse(null, { status: 204 });
  },
);
