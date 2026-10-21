import { z } from 'zod';
import { ALLOWED_IMAGE_MIME } from './constants';

/** Изображения на доске — не больше 20 МБ (крупнее — это уже файл, итерация 7) */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const imageMimeSchema = z.enum(ALLOWED_IMAGE_MIME);

/** Поля multipart-формы загрузки рядом с файлом: размеры считает клиент при декодировании */
export const imageUploadFieldsSchema = z.object({
  width: z.coerce.number().int().min(1).max(30_000),
  height: z.coerce.number().int().min(1).max(30_000),
});

export interface UploadedAsset {
  id: string;
  /** Адрес для <img>/Konva: отдаётся web с проверкой прав на доску */
  url: string;
  mimeType: string;
  width: number;
  height: number;
}

/** Same-origin адрес ассета (см. /api/assets/:id) */
export function assetUrl(assetId: string): string {
  return `/api/assets/${assetId}`;
}
