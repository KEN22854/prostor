import type { BoardElement } from '@prostor/shared';
import type { ElementPatch } from '@/lib/canvas/board-actions';

export interface NodeTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

const MIN_SIZE = 8;
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Перевод результата Konva.Transformer (масштаб ноды) в поля элемента.
 *
 * Konva во время трансформации меняет scaleX/scaleY ноды; храним же мы
 * width/height (и точки у линий) — иначе обводка и текст масштабировались бы
 * вместе с объектом. После записи scale ноды сбрасывается в 1.
 *
 * Текст: растяжение за боковую ручку меняет ширину (перенос строк),
 * за угловую — масштабирует шрифт.
 */
export function patchFromTransform(el: BoardElement, t: NodeTransform): ElementPatch {
  const sx = Math.abs(t.scaleX);
  const sy = Math.abs(t.scaleY);
  const base: ElementPatch = { x: round(t.x), y: round(t.y), rotation: round(t.rotation) };

  if ('points' in el && Array.isArray(el.points)) {
    return {
      ...base,
      points: el.points.map((v, i) => round(v * (i % 2 === 0 ? t.scaleX : t.scaleY))),
      width: round(el.width * sx),
      height: round(el.height * sy),
    };
  }

  const patch: ElementPatch = {
    ...base,
    width: round(Math.max(MIN_SIZE, el.width * sx)),
    height: round(Math.max(MIN_SIZE, el.height * sy)),
  };
  if (el.type === 'text' && Math.abs(sx - 1) > 0.001 && Math.abs(sy - 1) > 0.001) {
    patch.fontSize = Math.max(4, Math.min(512, Math.round(el.fontSize * sy)));
  }
  return patch;
}
