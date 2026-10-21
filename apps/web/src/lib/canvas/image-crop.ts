import type { ImageCrop, ImageElement } from '@prostor/shared';

/**
 * Кадрирование изображений. crop — видимая часть в пикселях исходника;
 * элемент на доске показывает ровно её, растянутую на width × height.
 */

/** Текущая видимая область (без обрезки — весь исходник) */
export function currentCrop(
  el: Pick<ImageElement, 'crop' | 'naturalWidth' | 'naturalHeight'>,
): ImageCrop {
  return el.crop ?? { x: 0, y: 0, width: el.naturalWidth, height: el.naturalHeight };
}

/** Масштаб «пиксель исходника → единица доски» по осям */
export function cropScale(
  el: Pick<ImageElement, 'crop' | 'naturalWidth' | 'naturalHeight' | 'width' | 'height'>,
) {
  const c = currentCrop(el);
  return { sx: el.width / c.width, sy: el.height / c.height };
}

/** Прямоугольник всего исходника в локальных координатах элемента (для режима обрезки) */
export function fullImageRect(el: ImageElement) {
  const c = currentCrop(el);
  const { sx, sy } = cropScale(el);
  return { x: -c.x * sx, y: -c.y * sy, width: el.naturalWidth * sx, height: el.naturalHeight * sy };
}

/** Обрезка в границах исходника, не меньше 4 px */
export function clampCrop(crop: ImageCrop, naturalWidth: number, naturalHeight: number): ImageCrop {
  const width = Math.min(naturalWidth, Math.max(4, crop.width));
  const height = Math.min(naturalHeight, Math.max(4, crop.height));
  return {
    x: Math.min(naturalWidth - width, Math.max(0, crop.x)),
    y: Math.min(naturalHeight - height, Math.max(0, crop.y)),
    width,
    height,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Поля элемента после новой обрезки: масштаб на доске сохраняется, а
 * оставшаяся часть картинки не сдвигается (с учётом поворота вокруг (x, y)).
 */
export function applyCrop(el: ImageElement, next: ImageCrop | null) {
  const c = currentCrop(el);
  const { sx, sy } = cropScale(el);
  const target = next ?? { x: 0, y: 0, width: el.naturalWidth, height: el.naturalHeight };
  const dx = (target.x - c.x) * sx;
  const dy = (target.y - c.y) * sy;
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  const full =
    target.x === 0 &&
    target.y === 0 &&
    target.width === el.naturalWidth &&
    target.height === el.naturalHeight;
  return {
    crop: full ? undefined : target,
    x: round(el.x + dx * Math.cos(rad) - dy * Math.sin(rad)),
    y: round(el.y + dx * Math.sin(rad) + dy * Math.cos(rad)),
    width: round(target.width * sx),
    height: round(target.height * sy),
  };
}
