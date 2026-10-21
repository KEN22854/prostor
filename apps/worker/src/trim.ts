import { PNG } from 'pngjs';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Пиксель с альфой ниже порога считаем фоном (остатки полупрозрачного «ореола») */
const ALPHA_THRESHOLD = 8;
/** Запас вокруг объекта, чтобы не резать мягкие края маски */
const PADDING = 4;

/**
 * Обрезка прозрачных полей PNG после удаления фона.
 *
 * Без неё результат сохраняет размер исходного фото: объект занимает его
 * часть, а рамка выделения на доске охватывает огромную пустую область.
 * Возвращает новый PNG и прямоугольник обрезки в пикселях исходника —
 * клиент по нему сдвигает и уменьшает элемент, чтобы объект остался на месте.
 * null — обрезать нечего (нет альфы, всё прозрачно или поля меньше запаса).
 */
export function trimTransparent(bytes: Uint8Array): { png: Uint8Array; crop: CropRect } | null {
  let image: PNG;
  try {
    image = PNG.sync.read(Buffer.from(bytes));
  } catch {
    return null;
  }
  const { width, height, data } = image;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if ((data[row + x * 4 + 3] ?? 0) >= ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // всё прозрачно — модель не нашла объект, оставляем как есть

  const crop: CropRect = {
    x: Math.max(0, minX - PADDING),
    y: Math.max(0, minY - PADDING),
    width: 0,
    height: 0,
  };
  crop.width = Math.min(width, maxX + 1 + PADDING) - crop.x;
  crop.height = Math.min(height, maxY + 1 + PADDING) - crop.y;
  if (crop.width === width && crop.height === height) return null;

  const out = new PNG({ width: crop.width, height: crop.height });
  PNG.bitblt(image, out, crop.x, crop.y, crop.width, crop.height, 0, 0);
  return { png: new Uint8Array(PNG.sync.write(out)), crop };
}
