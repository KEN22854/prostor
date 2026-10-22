import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { searchFeed } from '@/services/image-feed';

/** GET /api/images/search?q=кот&cursor=commons:40 — лента свободных картинок */
export const GET = withErrorHandling(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const page = await searchFeed(params.get('q') ?? '', params.get('cursor'));
  return NextResponse.json(page, { headers: { 'cache-control': 'private, max-age=600' } });
});
