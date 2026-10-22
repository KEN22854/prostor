import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import { openAsset } from '@/services/assets';

/**
 * GET /api/assets/:id — файл ассета через web (а не прямой ссылкой на S3):
 *  - права проверяются на каждый запрос (приватные доски);
 *  - same-origin: Konva может читать пиксели картинок (экспорт PNG/PDF
 *    без «грязного» canvas и без настройки CORS у хранилища).
 * Файлы неизменяемы (новая загрузка = новый id), поэтому кешируются надолго —
 * но только в браузере пользователя (private), не в общих прокси.
 */
export const GET = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ assetId: string }> }) => {
    const { assetId } = await params;
    const user = await getSessionUser();
    // Range — только простой «bytes=a-b»: перемотка аудио; остальное — файл целиком
    const rangeHeader = req.headers.get('range');
    const range = rangeHeader && /^bytes=d*-d*$/.test(rangeHeader) ? rangeHeader : undefined;
    const asset = await openAsset(assetId, user?.id ?? null, range);
    if (!asset) return new NextResponse(null, { status: 404 });

    if (!range && req.headers.get('if-none-match') === asset.etag) {
      await asset.body.cancel();
      return new NextResponse(null, { status: 304, headers: { ETag: asset.etag } });
    }

    const headers: Record<string, string> = {
      'Content-Type': asset.mimeType,
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: asset.etag,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      // SVG, открытый напрямую, не должен исполнять скрипты в нашем origin
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    };
    if (asset.contentLength !== undefined) headers['Content-Length'] = String(asset.contentLength);
    if (range && asset.contentRange) {
      headers['Content-Range'] = asset.contentRange;
      return new NextResponse(asset.body, { status: 206, headers });
    }
    return new NextResponse(asset.body, { headers });
  },
);
