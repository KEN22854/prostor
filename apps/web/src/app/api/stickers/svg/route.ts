import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { stickerSvg } from '@/services/stickers';

/** GET /api/stickers/svg?id=noto:cat — превью стикера (неизменяемое) */
export const GET = withErrorHandling(async (req: Request) => {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const svg = await stickerSvg(id);
  if (!svg) return new NextResponse(null, { status: 404 });
  return new NextResponse(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=2592000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
