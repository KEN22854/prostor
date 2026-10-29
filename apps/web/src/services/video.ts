import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@prostor/db';
import { ApiError } from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import { putObject } from '@/lib/s3';
import type { SessionUser } from '@/lib/session';
import { requireBoardAccess } from '@/services/boards';

export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

/** Формат видео по сигнатуре файла (Content-Type браузера не доверяем) */
export function videoFormat(b: Uint8Array): { mime: string; ext: string } | null {
  const at = (i: number) => b[i] ?? -1;
  const str = (from: number, len: number) =>
    String.fromCharCode(...Array.from(b.subarray(from, from + len)));
  if (at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3)
    return { mime: 'video/webm', ext: 'webm' };
  if (str(4, 4) === 'ftyp') {
    const brand = str(8, 4);
    if (brand === 'qt  ') return { mime: 'video/quicktime', ext: 'mov' };
    // Аудио-контейнеры M4A — не видео
    if (brand === 'M4A ' || brand === 'M4B ') return null;
    return { mime: 'video/mp4', ext: 'mp4' };
  }
  if (str(0, 4) === 'OggS') return { mime: 'video/ogg', ext: 'ogv' };
  return null;
}

/** Видеофайл или запись экрана на доску (ассет доски, до 300 МБ) */
export async function uploadBoardVideo(
  user: SessionUser,
  boardId: string,
  form: FormData,
): Promise<{ assetId: string; mimeType: string; title: string }> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const limit = await rateLimit(`video-upload:${user.id}`, 30, 3600);
  if (!limit.ok) throw new ApiError(429, 'rate_limited', 'Слишком много загрузок видео. Подождите');
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'no_file', 'Файл не передан');
  if (file.size === 0 || file.size > MAX_VIDEO_BYTES) {
    throw new ApiError(413, 'too_large', 'Видео должно быть не больше 300 МБ');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = videoFormat(bytes);
  if (!format) throw new ApiError(415, 'unsupported_type', 'Поддерживаются MP4, WebM, MOV и OGG');
  const rawTitle = form.get('title');
  const title =
    (typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle : file.name.replace(/\.\w+$/, ''))
      .trim()
      .slice(0, 200) || 'Видео';

  const key = `boards/${boardId}/video/${randomUUID()}.${format.ext}`;
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
  return { assetId: asset.id, mimeType: format.mime, title };
}
