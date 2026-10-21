import { describe, expect, it } from 'vitest';
import type { BoardElement, CommentThreadDto } from '@prostor/shared';
import { normalize, searchBoard, snippetAround } from './search';

const el = (id: string, type: string, extra: Record<string, unknown>) =>
  ({ id, type, x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 'a0', ...extra }) as unknown as BoardElement;

const thread = (id: string, body: string, replies: string[] = []): CommentThreadDto =>
  ({
    id,
    body,
    elementId: null,
    x: 5,
    y: 6,
    resolvedAt: null,
    replies: replies.map((b, i) => ({ id: `${id}-${i}`, body: b })),
  }) as unknown as CommentThreadDto;

describe('searchBoard', () => {
  const elements = [
    el('s1', 'sticky', { text: 'Ёлка на Новый год' }),
    el('f1', 'frame', { title: 'Спринт 12' }),
    el('a1', 'arrow', { label: 'данные' }),
    el('h', 'sticky', { text: 'ёлка', hidden: true }),
    el('t1', 'table', { cells: [['Имя', 'Роль'], ['Аня', 'дизайнер']] }),
  ];

  it('без учёта регистра и «ё», скрытые объекты не ищутся', () => {
    const hits = searchBoard(elements, [], 'ЕЛКА');
    expect(hits.map((h) => h.id)).toEqual(['s1']);
    expect(hits[0]?.where).toBe('Стикер');
  });

  it('названия фреймов, подписи стрелок и ячейки таблиц', () => {
    expect(searchBoard(elements, [], 'спринт')[0]?.id).toBe('f1');
    expect(searchBoard(elements, [], 'данн')[0]?.where).toBe('Стрелка');
    expect(searchBoard(elements, [], 'дизайнер')[0]?.id).toBe('t1');
  });

  it('комментарии: по тексту и ответам, с точкой на доске', () => {
    const hits = searchBoard([], [thread('c1', 'привет', ['посмотрите макет'])], 'макет');
    expect(hits[0]).toMatchObject({ kind: 'comment', id: 'c1', point: { x: 5, y: 6 } });
  });

  it('пустой запрос — ничего', () => {
    expect(searchBoard(elements, [], '   ')).toEqual([]);
  });
});

describe('snippetAround', () => {
  it('фрагмент с многоточиями вокруг совпадения', () => {
    const text = `${'а'.repeat(50)} нужное слово ${'б'.repeat(50)}`;
    const s = snippetAround(text, normalize('нужное'), 5);
    expect(s.startsWith('…')).toBe(true);
    expect(s).toContain('нужное');
    expect(s.endsWith('…')).toBe(true);
  });
});
