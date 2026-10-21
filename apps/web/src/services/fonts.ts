import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@prostor/db';
import { ApiError } from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import { putObject } from '@/lib/s3';
import type { SessionUser } from '@/lib/session';
import { requireBoardAccess } from '@/services/boards';

const MAX_FONT_BYTES = 10 * 1024 * 1024;

/** Формат шрифта по сигнатуре файла, а не по расширению */
export function fontFormat(bytes: Uint8Array): { mime: string; ext: string } | null {
  const tag = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (tag === 'wOF2') return { mime: 'font/woff2', ext: 'woff2' };
  if (tag === 'wOFF') return { mime: 'font/woff', ext: 'woff' };
  if (tag === 'OTTO') return { mime: 'font/otf', ext: 'otf' };
  if (tag === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) {
    return { mime: 'font/ttf', ext: 'ttf' };
  }
  return null;
}

/** Имя семейства: из поля формы или имени файла; без кавычек и спецсимволов (идёт в CSS) */
export function fontFamilyName(raw: string): string | null {
  const name = raw
    .replace(/\.(ttf|otf|woff2?)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  return name.length > 0 ? name : null;
}

/** Свой шрифт для доски: файл в S3 (ассет доски), семейство — для меню шрифтов */
export async function uploadBoardFont(
  user: SessionUser,
  boardId: string,
  form: FormData,
): Promise<{ assetId: string; family: string }> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const limit = await rateLimit(`font-upload:${user.id}`, 30, 3600);
  if (!limit.ok)
    throw new ApiError(429, 'rate_limited', 'Слишком много загрузок шрифтов. Подождите');

  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'no_file', 'Файл не передан');
  if (file.size === 0 || file.size > MAX_FONT_BYTES) {
    throw new ApiError(413, 'too_large', 'Файл шрифта должен быть не больше 10 МБ');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = fontFormat(bytes);
  if (!format)
    throw new ApiError(415, 'unsupported_type', 'Поддерживаются шрифты TTF, OTF, WOFF и WOFF2');
  const requested = form.get('family');
  const family = fontFamilyName(
    typeof requested === 'string' && requested.trim() ? requested : file.name,
  );
  if (!family) throw new ApiError(422, 'bad_family', 'Укажите название шрифта');

  const key = `boards/${boardId}/fonts/${randomUUID()}.${format.ext}`;
  await putObject(key, bytes, format.mime);
  const asset = await prisma.asset.create({
    data: {
      ownerId: user.id,
      boardId,
      kind: 'FILE',
      s3Key: key,
      mimeType: format.mime,
      sizeBytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    select: { id: true },
  });
  return { assetId: asset.id, family };
}
