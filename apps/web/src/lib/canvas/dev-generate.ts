import { generateNKeysBetween } from 'fractional-indexing';
import { nanoid } from 'nanoid';
import type * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';
import { maxZIndex, toYMap } from '@/lib/canvas/element-factory';

const FILLS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa'];
const SHAPES = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'star'] as const;
const WORDS = [
  'Идея',
  'Гипотеза',
  'Риск',
  'Задача',
  'Вопрос',
  'Решение',
  'Метрика',
  'Баг',
  'Фича',
  'Ретро',
];

/**
 * Генератор нагрузки для замеров производительности (только dev-режим):
 * смесь стикеров, фигур, текста и линий сеткой. Всё в одной транзакции —
 * один Yjs-апдейт, один пересчёт индекса.
 */
export function generateTestElements(
  doc: Y.Doc,
  count: number,
  userId: string,
  origin: unknown,
): void {
  const elements = doc.getMap<unknown>(Y_KEYS.elements);
  const keys = generateNKeysBetween(maxZIndex(elements), null, count);
  const columns = Math.ceil(Math.sqrt(count));
  const cell = 260;
  const now = Date.now();

  doc.transact(() => {
    for (let i = 0; i < count; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = col * cell;
      const y = row * cell;
      const base = {
        id: nanoid(12),
        x,
        y,
        rotation: 0,
        zIndex: keys[i] ?? `a${i}`,
        locked: false,
        hidden: false,
        opacity: 1,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };
      const word = WORDS[i % WORDS.length] ?? 'Идея';
      const fill = FILLS[i % FILLS.length] ?? '#fde68a';
      const text = {
        fontFamily: 'Inter',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textColor: '#1f2937',
      };
      let element: Record<string, unknown>;
      switch (i % 5) {
        case 0:
        case 1:
          element = {
            ...base,
            ...text,
            type: 'sticky',
            width: 200,
            height: 200,
            fill,
            text: `${word} #${i}`,
            fontSize: 18,
            align: 'left',
            verticalAlign: 'top',
          };
          break;
        case 2:
          element = {
            ...base,
            ...text,
            type: 'shape',
            shape: SHAPES[i % SHAPES.length] ?? 'rect',
            width: 180,
            height: 140,
            fill,
            stroke: '#334155',
            strokeWidth: 2,
            text: word,
            fontSize: 16,
            align: 'center',
            verticalAlign: 'middle',
          };
          break;
        case 3:
          element = {
            ...base,
            ...text,
            type: 'text',
            width: 220,
            height: 60,
            text: `${word}: заметка ${i}`,
            fontSize: 20,
            align: 'left',
            verticalAlign: 'top',
          };
          break;
        default:
          element = {
            ...base,
            type: 'arrow',
            width: 200,
            height: 120,
            points: [0, 0, 200, 120],
            stroke: '#475569',
            strokeWidth: 3,
            startArrow: 'none',
            endArrow: 'arrow',
          };
      }
      elements.set(base.id, toYMap(element));
    }
  }, origin);
}

export function clearAllElements(doc: Y.Doc, origin: unknown): void {
  const elements = doc.getMap<unknown>(Y_KEYS.elements);
  doc.transact(() => {
    for (const key of Array.from(elements.keys())) elements.delete(key);
  }, origin);
}
