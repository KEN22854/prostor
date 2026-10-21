import type * as Y from 'yjs';
import { XmlFragment as YXmlFragment } from 'yjs';
import {
  ELEMENT_TYPES,
  elementBounds,
  richToPlain,
  type BoardElement,
  type Bounds,
  type ElementType,
} from '@prostor/shared';
import { fragmentToRich } from '@/lib/rich-text/yjs-convert';

const TYPES = new Set<string>(ELEMENT_TYPES);
const POINT_TYPES = new Set<ElementType>(['line', 'arrow', 'path']);

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Y.Map элемента → неизменяемый plain-объект для рендера.
 *
 * Сознательно не zod: на открытии доски с 10 000 объектов полная валидация
 * стоила бы сотни миллисекунд. Здесь — дешёвые проверки обязательных полей
 * и дефолты; данные извне (импорт, ИИ) валидирует boardElementSchema на входе.
 * Невалидный элемент (null) не рендерится и не ломает доску.
 */
export function readElement(id: string, map: Y.Map<unknown>): BoardElement | null {
  const raw = map.toJSON() as Record<string, unknown>;
  const type = raw.type;
  if (typeof type !== 'string' || !TYPES.has(type)) return null;

  const element: Record<string, unknown> = {
    ...raw,
    id,
    type,
    x: num(raw.x),
    y: num(raw.y),
    width: Math.max(0, num(raw.width)),
    height: Math.max(0, num(raw.height)),
    rotation: num(raw.rotation),
    zIndex: typeof raw.zIndex === 'string' && raw.zIndex ? raw.zIndex : 'a0',
    opacity: num(raw.opacity, 1),
    locked: raw.locked === true,
    hidden: raw.hidden === true,
  };

  // Форматированный текст (Y.XmlFragment, y-prosemirror) → абзацы; text — его плоская копия,
  // поэтому коллеги видят набор «вживую», даже если поле text ещё не обновлено
  const content = map.get('content');
  delete element.content;
  if (content instanceof YXmlFragment) {
    const rich = fragmentToRich(content);
    element.rich = rich;
    element.text = richToPlain(rich);
  }

  if (POINT_TYPES.has(type as ElementType)) {
    const points = Array.isArray(raw.points)
      ? raw.points.filter((p): p is number => typeof p === 'number')
      : [];
    element.points = points.length % 2 === 0 ? points : points.slice(0, -1);
  }

  return element as unknown as BoardElement;
}

/**
 * Габариты элемента в мировых координатах. У линий и путей width/height
 * могут быть неточными — считаем по точкам (+ толщина линии).
 */
export function boundsOf(element: BoardElement): Bounds {
  if ('points' in element && Array.isArray(element.points) && element.points.length >= 2) {
    const pts = element.points;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const px = pts[i] ?? 0;
      const py = pts[i + 1] ?? 0;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    const pad =
      'strokeWidth' in element && typeof element.strokeWidth === 'number'
        ? element.strokeWidth / 2 + 8
        : 8;
    return {
      minX: element.x + minX - pad,
      minY: element.y + minY - pad,
      maxX: element.x + maxX + pad,
      maxY: element.y + maxY + pad,
    };
  }
  return elementBounds(element);
}

/** id элемента, затронутого событием observeDeep на карте elements */
export function changedElementIds(
  events: Array<Y.YEvent<Y.AbstractType<unknown>>>,
  root: Y.Map<unknown>,
): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.target === root) {
      for (const key of event.changes.keys.keys()) ids.add(key);
    } else {
      // Вложенное изменение (поле элемента, Y.Text): path относительно root, path[0] — id
      const first = event.path[0];
      if (typeof first === 'string') ids.add(first);
    }
  }
  return ids;
}
