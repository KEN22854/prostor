import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { fetchFeedImage } from '@/services/image-feed';

/**
 * GET /api/images/proxy?url=… — картинка ленты с нашего адреса (same-origin):
 * её можно скопировать в буфер обмена (canvas не «пачкается»).
 */
export const GET = withErrorHandling(async (req: Request) => {
  await requireUser();
  const img = await fetchFeedImage(new URL(req.url).searchParams.get('url') ?? '');
  return new NextResponse(Buffer.from(img.bytes), {
    headers: { 'content-type': img.mimeType, 'cache-control': 'private, max-age=86400' },
  });
});
