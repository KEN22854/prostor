import { NextResponse } from 'next/server';
import { ApiError, withErrorHandling } from '@/lib/api';
import { fontFile } from '@/lib/fonts/google';

/** GET /api/fonts/file?u=/s/roboto/…woff2 — файл шрифта (неизменяемый, кэш год) */
export const GET = withErrorHandling(async (req: Request) => {
  const path = new URL(req.url).searchParams.get('u') ?? '';
  const file = await fontFile(path);
  if (!file) throw new ApiError(404, 'font_not_found', 'Файл шрифта не найден');
  return new NextResponse(Buffer.from(file.body), {
    headers: {
      'content-type': file.type,
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
    },
  });
});
