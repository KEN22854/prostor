import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { searchStickers } from '@/services/stickers';

/** GET /api/stickers/search?q=кот&set=noto&limit=96 */
export const GET = withErrorHandling(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const icons = await searchStickers(
    params.get('q') ?? '',
    params.get('set'),
    Number(params.get('limit') ?? 96) || 96,
  );
  return NextResponse.json({ icons }, { headers: { 'cache-control': 'private, max-age=3600' } });
});
