import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma, resolveBoardAccess } from '@prostor/db';
import {
  MAX_IMAGE_BYTES,
  assetUrl,
  can,
  imageMimeSchema,
  imageUploadFieldsSchema,
  type UploadedAsset,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import { getObjectStream, putObject, type ObjectStream } from '@/lib/s3';
import type { SessionUser } from '@/lib/session';
import { requireBoardAccess } from '@/services/boards';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/**
 * Сигнатуры форматов: Content-Type от браузера легко подделать,
 * поэтому сверяем первые байты файла с заявленным типом.
 */
function matchesSignature(bytes: Uint8Array, mime: string): boolean {
  const b = (i: number) => bytes[i] ?? -1;
  switch (mime) {
    case 'image/png':
      return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
    case 'image/jpeg':
      return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
    case 'image/gif':
      return b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46;
    case 'image/webp':
      return (
        b(0) === 0x52 &&
        b(1) === 0x49 &&
        b(2) === 0x46 &&
        b(3) === 0x46 &&
        b(8) === 0x57 &&
        b(9) === 0x45
      );
    case 'image/svg+xml': {
      const head = new TextDecoder().decode(bytes.subarray(0, 1024)).toLowerCase();
      return head.includes('<svg');
    }
    default:
      return false;
  }
}

/** Загрузка изображения на доску (нужны права редактора) */
export async function uploadBoardImage(
  user: SessionUser,
  boardId: string,
  form: FormData,
): Promise<UploadedAsset> {
  await requireBoardAccess(boardId, user.id, 'edit');

  const limit = await rateLimit(`upload:user:${user.id}`, 120, 10 * 60);
  if (!limit.ok)
    throw new ApiError(429, 'rate_limited', 'Слишком много загрузок. Подождите немного');

  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'no_file', 'Файл не передан');
  if (file.size === 0) throw new ApiError(400, 'empty_file', 'Пустой файл');
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError(413, 'too_large', 'Изображение больше 20 МБ');

  const mime = imageMimeSchema.safeParse(file.type);
  if (!mime.success)
    throw new ApiError(415, 'unsupported_type', 'Поддерживаются PNG, JPEG, WebP, GIF и SVG');

  const fields = imageUploadFieldsSchema.safeParse({
    width: form.get('width'),
    height: form.get('height'),
  });
  if (!fields.success)
    throw new ApiError(422, 'validation_error', 'Некорректные размеры изображения');

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(bytes, mime.data)) {
    throw new ApiError(415, 'bad_signature', 'Содержимое файла не соответствует формату');
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  // Дедупликация: та же картинка на той же доске уже загружена — переиспользуем
  const existing = await prisma.asset.findFirst({
    where: { boardId, sha256, deletedAt: null },
    select: { id: true, mimeType: true, width: true, height: true },
  });
  if (existing) {
    return {
      id: existing.id,
      url: assetUrl(existing.id),
      mimeType: existing.mimeType,
      width: existing.width ?? fields.data.width,
      height: existing.height ?? fields.data.height,
    };
  }

  const key = `boards/${boardId}/${randomUUID()}.${EXT[mime.data] ?? 'bin'}`;
  await putObject(key, bytes, mime.data);
  const asset = await prisma.asset.create({
    data: {
      ownerId: user.id,
      boardId,
      kind: 'IMAGE',
      s3Key: key,
      mimeType: mime.data,
      sizeBytes: bytes.byteLength,
      width: fields.data.width,
      height: fields.data.height,
      sha256,
    },
    select: { id: true },
  });
  return { id: asset.id, url: assetUrl(asset.id), mimeType: mime.data, ...fields.data };
}

export interface AssetDownload extends ObjectStream {
  mimeType: string;
  etag: string;
}

/**
 * Файл ассета с проверкой прав: ассет доски доступен тем, кто видит доску
 * (включая анонимов на публичных досках). Нет доступа → null (404 наружу).
 */
export async function openAsset(
  assetId: string,
  userId: string | null,
): Promise<AssetDownload | null> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      s3Key: true,
      mimeType: true,
      boardId: true,
      ownerId: true,
      sha256: true,
      deletedAt: true,
    },
  });
  if (!asset || asset.deletedAt) return null;

  if (asset.boardId) {
    const access = await resolveBoardAccess(prisma, asset.boardId, userId);
    if (!access || !can(access.role, 'view', access.policy)) return null;
  } else if (asset.ownerId !== userId) {
    return null;
  }

  const stream = await getObjectStream(asset.s3Key);
  if (!stream) return null;
  return { ...stream, mimeType: asset.mimeType, etag: `"${asset.sha256 ?? assetId}"` };
}
