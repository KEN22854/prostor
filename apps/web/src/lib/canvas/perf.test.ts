import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { LOCAL_ORIGIN, Y_KEYS } from '@prostor/shared';
import { layoutRich } from '@/lib/rich-text/layout';
import { generateTestElements } from './dev-generate';
import { ElementStore } from './element-store';
import { elementsInRect, pointQuery, topmostAt } from './hit-test';

/**
 * Бюджеты производительности ядра холста на 10 000 объектов.
 * Пороги — с запасом в несколько раз от замеров на обычном ноутбуке, чтобы
 * ловить регрессии сложности (O(n) вместо O(log n)), а не шум CI.
 */
const N = 10_000;

function time<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  return { result, ms: performance.now() - start };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe(`производительность на ${N.toLocaleString('ru')} объектов`, () => {
  const doc = new Y.Doc();
  generateTestElements(doc, N, 'u1', LOCAL_ORIGIN);
  const ymap = doc.getMap<unknown>(Y_KEYS.elements);

  it('загрузка ElementStore (чтение Y.Map + R-tree bulk load) < 1.5 с', () => {
    const { result: store, ms } = time(() => new ElementStore(ymap));
    expect(store.size).toBe(N);
    expect(ms).toBeLessThan(1_500);
    store.destroy();
  });

  it('запрос видимой области (R-tree + сортировка) < 10 мс', () => {
    const store = new ElementStore(ymap);
    const samples: number[] = [];
    let found = 0;
    for (let i = 0; i < 50; i++) {
      // Экран ~1920×1080 при zoom 1 в случайном месте доски
      const x = (i * 977) % 20_000;
      const y = (i * 613) % 20_000;
      const { result, ms } = time(() =>
        store.query({ minX: x, minY: y, maxX: x + 1920, maxY: y + 1080 }),
      );
      found += result.length;
      samples.push(ms);
    }
    expect(found).toBeGreaterThan(0);
    expect(median(samples)).toBeLessThan(10);
    store.destroy();
  });

  it('hit-test под курсором < 1 мс, рамка выделения по 1 000 объектов < 20 мс', () => {
    const store = new ElementStore(ymap);
    const hits: number[] = [];
    for (let i = 0; i < 200; i++) {
      const p = { x: ((i * 131) % 100) * 260 + 50, y: ((i * 71) % 100) * 260 + 50 };
      hits.push(time(() => topmostAt(store.query(pointQuery(p, 4)), p, 4)).ms);
    }
    expect(median(hits)).toBeLessThan(1);

    const rect = { minX: 0, minY: 0, maxX: 8_000, maxY: 8_000 };
    const { result, ms } = time(() => elementsInRect(store.query(rect), rect));
    expect(result.length).toBeGreaterThan(900);
    expect(ms).toBeLessThan(20);
    store.destroy();
  });

  it('точечное обновление одного объекта среди 10 000 — без пересборки индекса (< 2 мс)', () => {
    const store = new ElementStore(ymap);
    const id = Array.from(ymap.keys())[N / 2] ?? '';
    const el = ymap.get(id) as Y.Map<unknown>;
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      samples.push(time(() => doc.transact(() => el.set('x', 1_000 + i), LOCAL_ORIGIN)).ms);
    }
    expect(store.get(id)?.x).toBe(1_049);
    expect(median(samples)).toBeLessThan(2);
    store.destroy();
  });

  it('раскладка форматированного текста стикера < 1 мс', () => {
    const measure = (t: string, font: string) => t.length * (font.includes('bold') ? 9 : 8);
    const paragraphs = [
      {
        runs: [
          { text: 'Гипотеза: ', bold: true },
          { text: 'пользователи бросают корзину на шаге оплаты, потому что' },
        ],
      },
      { bullet: true, runs: [{ text: 'нет оплаты через СБП' }] },
      { bullet: true, runs: [{ text: 'долго грузится форма', italic: true }] },
    ];
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(
        time(() =>
          layoutRich(
            paragraphs,
            {
              width: 172,
              height: 172,
              fontSize: 18,
              family: 'Inter',
              bold: false,
              italic: false,
              align: 'left',
              verticalAlign: 'top',
              ellipsis: true,
            },
            measure,
          ),
        ).ms,
      );
    }
    expect(median(samples)).toBeLessThan(1);
  });
});
