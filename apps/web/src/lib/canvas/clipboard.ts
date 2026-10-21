import { generateNKeysBetween } from 'fractional-indexing';
import { boardElementSchema, type BoardElement } from '@prostor/shared';
import { newElementId } from '@/lib/canvas/element-factory';

/** Маркер нашего формата в text/plain (кастомные MIME-типы браузеры в буфер не пускают) */
const KIND = 'prostor/elements';
const MAX_PASTE = 5_000;

interface ClipboardPayload {
  kind: typeof KIND;
  version: 1;
  elements: BoardElement[];
}

export function serializeElements(elements: readonly BoardElement[]): string {
  const payload: ClipboardPayload = { kind: KIND, version: 1, elements: [...elements] };
  return JSON.stringify(payload);
}

/**
 * Разбор вставки. Содержимое буфера — внешние данные (его мог положить
 * кто угодно), поэтому каждый элемент проходит zod-валидацию;
 * невалидные отбрасываются, а не ломают доску.
 */
export function parseClipboard(text: string): BoardElement[] | null {
  if (!text.startsWith('{') || !text.includes(KIND)) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { kind, elements } = data as { kind?: unknown; elements?: unknown };
  if (kind !== KIND || !Array.isArray(elements)) return null;

  const valid: BoardElement[] = [];
  for (const raw of elements.slice(0, MAX_PASTE)) {
    const parsed = boardElementSchema.safeParse(raw);
    if (parsed.success) valid.push(parsed.data as BoardElement);
  }
  return valid;
}

export interface PasteOptions {
  dx: number;
  dy: number;
  userId: string;
  /** Текущий максимальный zIndex на доске — вставка ложится поверх */
  maxZ: string | null;
}

/**
 * Копии элементов для вставки/дублирования: новые id, сдвиг, новые zIndex
 * поверх доски с сохранением взаимного порядка. Группы и привязки к фреймам
 * переназначаются внутри вставляемого набора; ссылки наружу — обрезаются.
 */
export function cloneForPaste(
  elements: readonly BoardElement[],
  opts: PasteOptions,
): BoardElement[] {
  const sorted = [...elements].sort((a, b) =>
    a.zIndex < b.zIndex ? -1 : a.zIndex > b.zIndex ? 1 : 0,
  );
  const keys = generateNKeysBetween(opts.maxZ, null, sorted.length);
  const idMap = new Map(sorted.map((el) => [el.id, newElementId()]));
  const groupMap = new Map<string, string>();
  const now = Date.now();

  return sorted.map((el, i) => {
    const groupId = el.groupId
      ? (groupMap.get(el.groupId) ??
        (groupMap.set(el.groupId, newElementId()), groupMap.get(el.groupId)))
      : undefined;
    const frameId = el.frameId ? idMap.get(el.frameId) : undefined;
    // Привязки стрелок: к скопированному объекту — переносим на копию, к остальным — отвязываем
    const bindings: Record<string, unknown> = {};
    if (el.type === 'line' || el.type === 'arrow') {
      for (const key of ['startBinding', 'endBinding'] as const) {
        const b = el[key];
        const target = b ? idMap.get(b.elementId) : undefined;
        bindings[key] = b && target ? { ...b, elementId: target } : undefined;
      }
    }
    return {
      ...el,
      ...bindings,
      id: idMap.get(el.id) ?? newElementId(),
      x: el.x + opts.dx,
      y: el.y + opts.dy,
      zIndex: keys[i] ?? el.zIndex,
      groupId,
      frameId,
      locked: false,
      createdBy: opts.userId,
      createdAt: now,
      updatedAt: now,
    } as BoardElement;
  });
}
