import type { BoardElement, CommentThreadDto } from '@prostor/shared';

/**
 * Поиск по доске: текст стикеров, фигур и текстовых блоков, названия
 * фреймов, подписи стрелок, описания картинок, ячейки таблиц и комментарии.
 * Без индекса: полный проход по 10 000 объектов — единицы миллисекунд,
 * а поиск запускается по вводу с задержкой.
 */

export interface SearchHit {
  kind: 'element' | 'comment';
  /** id объекта или треда комментариев */
  id: string;
  /** Объект, к которому относится совпадение (у комментария — если привязан) */
  elementId: string | null;
  /** Точка на доске для комментария без объекта */
  point: { x: number; y: number } | null;
  /** Где нашлось: «Стикер», «Фрейм», «Комментарий» … */
  where: string;
  /** Фрагмент текста вокруг совпадения */
  snippet: string;
}

const KIND_LABEL: Partial<Record<BoardElement['type'], string>> = {
  sticky: 'Стикер',
  text: 'Текст',
  shape: 'Фигура',
  frame: 'Фрейм',
  line: 'Линия',
  arrow: 'Стрелка',
  image: 'Изображение',
  table: 'Таблица',
  document: 'Документ',
};

/** Нормализация для сравнения: регистр, «ё», лишние пробелы */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

/** Все тексты объекта, по которым ищем */
export function searchableText(el: BoardElement): string {
  const parts: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) parts.push(v);
  };
  const record = el as unknown as Record<string, unknown>;
  add(record.text);
  add(record.title);
  add(record.label);
  add(record.alt);
  add(record.speakerNotes);
  add(record.url);
  const cells = record.cells;
  if (Array.isArray(cells)) {
    for (const row of cells) if (Array.isArray(row)) for (const cell of row) add(cell);
  }
  return parts.join(' · ');
}

/** Фрагмент вокруг первого совпадения (по нормализованной строке — позиции совпадают) */
export function snippetAround(text: string, query: string, radius = 32): string {
  const flat = text.replace(/\s+/g, ' ');
  const at = normalize(flat).indexOf(query);
  if (at < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + query.length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

export function searchBoard(
  elements: Iterable<BoardElement>,
  threads: readonly CommentThreadDto[],
  rawQuery: string,
  limit = 500,
): SearchHit[] {
  const query = normalize(rawQuery.trim());
  if (query.length === 0) return [];
  const hits: SearchHit[] = [];

  for (const el of elements) {
    if (el.hidden) continue;
    const text = searchableText(el);
    if (!text || !normalize(text).includes(query)) continue;
    hits.push({
      kind: 'element',
      id: el.id,
      elementId: el.id,
      point: null,
      where: KIND_LABEL[el.type] ?? 'Объект',
      snippet: snippetAround(text, query),
    });
    if (hits.length >= limit) return hits;
  }

  for (const t of threads) {
    const bodies = [t.body, ...t.replies.map((r) => r.body)];
    const match = bodies.find((b) => normalize(b).includes(query));
    if (!match) continue;
    hits.push({
      kind: 'comment',
      id: t.id,
      elementId: t.elementId,
      point: t.x !== null && t.y !== null ? { x: t.x, y: t.y } : null,
      where: t.resolvedAt ? 'Комментарий (решён)' : 'Комментарий',
      snippet: snippetAround(match, query),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
