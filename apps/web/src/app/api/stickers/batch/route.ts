import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { stickerSvgs } from '@/services/stickers';

/** GET /api/stickers/batch?ids=noto:cat,twemoji:dog — SVG превью пачкой (до 150) */
export const GET = withErrorHandling(async (req: Request) => {
  await requireUser();
  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',')
    .filter(Boolean)
    .slice(0, 150);
  return NextResponse.json(
    { svgs: await stickerSvgs(ids) },
    { headers: { 'cache-control': 'private, max-age=86400' } },
  );
});
