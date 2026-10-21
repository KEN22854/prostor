import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES, type UploadedAsset } from '@prostor/shared';
import { ApiClientError } from '@/lib/fetcher';

const ALLOWED = new Set<string>(ALLOWED_IMAGE_MIME);

export function isSupportedImage(file: File): boolean {
  return ALLOWED.has(file.type);
}

/** Натуральные размеры картинки (SVG createImageBitmap не умеет — через <img>) */
async function measure(file: File): Promise<{ width: number; height: number }> {
  if (file.type !== 'image/svg+xml' && typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth || 400, height: img.naturalHeight || 300 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Загрузка изображения на доску; бросает ApiClientError с понятным сообщением */
export async function uploadImage(boardId: string, file: File): Promise<UploadedAsset> {
  if (!isSupportedImage(file))
    throw new ApiClientError(415, 'unsupported_type', 'Поддерживаются PNG, JPEG, WebP, GIF и SVG');
  if (file.size > MAX_IMAGE_BYTES)
    throw new ApiClientError(413, 'too_large', 'Изображение больше 20 МБ');

  let size: { width: number; height: number };
  try {
    size = await measure(file);
  } catch {
    throw new ApiClientError(422, 'decode_failed', `Не удалось прочитать «${file.name}»`);
  }

  const form = new FormData();
  form.set('file', file);
  form.set('width', String(size.width));
  form.set('height', String(size.height));

  let res: Response;
  try {
    res = await fetch(`/api/boards/${boardId}/assets`, { method: 'POST', body: form });
  } catch {
    throw new ApiClientError(0, 'network_error', 'Нет соединения с сервером');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { error?: { message?: unknown } } | null)?.error?.message;
    throw new ApiClientError(
      res.status,
      'upload_failed',
      typeof message === 'string' ? message : 'Не удалось загрузить изображение',
    );
  }
  return data as UploadedAsset;
}

/** Размер на доске: не больше 600 мировых единиц по большей стороне */
export function displaySize(
  width: number,
  height: number,
  maxSide = 600,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
