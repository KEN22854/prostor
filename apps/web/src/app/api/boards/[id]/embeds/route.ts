import { NextResponse } from 'next/server';
import { embedPreviewRequestSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { previewEmbed } from '@/services/embeds';

/** POST /api/boards/:id/embeds — превью ссылки для карточки (заголовок, сайт, картинка, плеер) */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const { url } = await parseJson(req, embedPreviewRequestSchema);
    return NextResponse.json(await previewEmbed(user, id, url));
  },
);
