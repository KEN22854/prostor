import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { importFeedImage } from '@/services/image-feed';

/** POST /api/boards/:id/images { url } — картинка из ленты на доску (ассет доски) */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const { url } = await parseJson(req, z.object({ url: z.string().url().max(2048) }));
    return NextResponse.json(await importFeedImage(user, id, url), { status: 201 });
  },
);
