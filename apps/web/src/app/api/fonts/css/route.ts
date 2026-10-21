import { NextResponse } from 'next/server';
import { ApiError, withErrorHandling } from '@/lib/api';
import { fontCss, validFamily } from '@/lib/fonts/google';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/** GET /api/fonts/css?family=Roboto&weights=400,700[&text=Roboto] — @font-face через наш сервер */
export const GET = withErrorHandling(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const family = params.get('family') ?? '';
  if (!validFamily(family)) throw new ApiError(400, 'bad_family', 'Некорректное имя шрифта');
  const weights = (params.get('weights') ?? '400,700')
    .split(',')
    .map(Number)
    .filter((w) => Number.isInteger(w) && w >= 100 && w <= 900)
    .slice(0, 9);
  const text = params.get('text')?.slice(0, 100) || undefined;
  const limit = await rateLimit(`fonts:${clientIp(req.headers)}`, 600, 60);
  if (!limit.ok) throw new ApiError(429, 'rate_limited', 'Слишком много запросов шрифтов');
  const css = await fontCss(family, weights, text);
  if (!css) throw new ApiError(404, 'font_not_found', 'Шрифт не найден');
  return new NextResponse(css, {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
});
