import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@prostor/db';
import { ApiError } from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import { putObject } from '@/lib/s3';
import type { SessionUser } from '@/lib/session';
import { requireBoardAccess } from '@/services/boards';

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

/** Формат аудио по сигнатуре файла (браузерный Content-Type не доверяем) */
export function audioFormat(b: Uint8Array): { mime: string; ext: string } | null {
  const at = (i: number) => b[i] ?? -1;
  const str = (from: number, len: number) =>
    String.fromCharCode(...Array.from(b.subarray(from, from + len)));
  // AAC ADTS (0xFFF1/0xFFF9): синхрослово как у MP3, но биты layer = 00
  if (at(0) === 0xff && (at(1) & 0xf6) === 0xf0) return { mime: 'audio/aac', ext: 'aac' };
  // MP3: тег ID3 или сразу кадр (синхрослово + layer ≠ 00)
  if (str(0, 3) === 'ID3' || (at(0) === 0xff && (at(1) & 0xe0) === 0xe0 && (at(1) & 0x06) !== 0)) {
    return { mime: 'audio/mpeg', ext: 'mp3' };
  }
  if (str(0, 4) === 'RIFF' && str(8, 4) === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  if (str(0, 4) === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  if (str(0, 4) === 'fLaC') return { mime: 'audio/flac', ext: 'flac' };
  if (at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3)
    return { mime: 'audio/webm', ext: 'webm' };
  if (str(4, 4) === 'ftyp') return { mime: 'audio/mp4', ext: 'm4a' };
  return null;
}

/** Аудиофайл или запись с микрофона на доску (ассет доски, до 50 МБ) */
export async function uploadBoardAudio(
  user: SessionUser,
  boardId: string,
  form: FormData,
): Promise<{ assetId: string; mimeType: string; title: string }> {
  await requireBoardAccess(boardId, user.id, 'edit');
  const limit = await rateLimit(`audio-upload:${user.id}`, 60, 3600);
  if (!limit.ok) throw new ApiError(429, 'rate_limited', 'Слишком много загрузок аудио. Подождите');
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'no_file', 'Файл не передан');
  if (file.size === 0 || file.size > MAX_AUDIO_BYTES) {
    throw new ApiError(413, 'too_large', 'Аудиофайл должен быть не больше 50 МБ');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = audioFormat(bytes);
  if (!format)
    throw new ApiError(
      415,
      'unsupported_type',
      'Поддерживаются MP3, WAV, OGG, M4A, AAC, FLAC и WebM',
    );
  const rawTitle = form.get('title');
  const title =
    (typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle : file.name.replace(/\.\w+$/, ''))
      .trim()
      .slice(0, 200) || 'Аудио';

  const key = `boards/${boardId}/audio/${randomUUID()}.${format.ext}`;
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
