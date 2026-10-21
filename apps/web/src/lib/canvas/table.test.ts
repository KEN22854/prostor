import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  DEFAULT_POLICY,
  LOCAL_ORIGIN,
  Y_KEYS,
  tableCellKey,
  type TableElement,
} from '@prostor/shared';
import { BoardActions } from './board-actions';
import { buildTable, insertElements } from './element-factory';
import { ElementStore } from './element-store';
import { searchBoard } from './search';
import { cellAt, deleteColumn, deleteRow, insertColumn, insertRow, tableLayout } from './table';

function setup() {
  const doc = new Y.Doc();
  const store = new ElementStore(doc.getMap(Y_KEYS.elements));
  const actions = new BoardActions({
    doc,
    store,
    userId: 'me',
    role: 'EDITOR',
    policy: DEFAULT_POLICY,
    undoManager: new Y.UndoManager(doc.getMap(Y_KEYS.elements), {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    }),
  });
  const table = {
    ...buildTable({
      x: 0,
      y: 0,
      userId: 'me',
      zIndex: 'a0',
      rows: 2,
      cols: 2,
      width: 200,
      height: 100,
    }),
    id: 'T',
    cells: [
      ['a', 'b'],
      ['c', 'd'],
    ],
  };
  doc.transact(() => insertElements(doc, [table]), 'setup');
  const get = () => store.get('T') as TableElement;
  return { doc, store, actions, get };
}

describe('таблица', () => {
  it('ячейки хранятся отдельными полями Y.Map и собираются при чтении', () => {
    const { doc, get } = setup();
    const map = doc.getMap(Y_KEYS.elements).get('T') as Y.Map<unknown>;
    expect(map.get('cell:1:0')).toBe('c');
    expect(map.has('cells')).toBe(false);
    expect(get().cells).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('правки разных ячеек двумя клиентами не перетирают друг друга', () => {
    const { doc } = setup();
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
    (doc.getMap(Y_KEYS.elements).get('T') as Y.Map<unknown>).set(tableCellKey(0, 0), 'мой');
    (other.getMap(Y_KEYS.elements).get('T') as Y.Map<unknown>).set(tableCellKey(1, 1), 'чужой');
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other));
    const store = new ElementStore(doc.getMap(Y_KEYS.elements));
    expect((store.get('T') as TableElement).cells).toEqual([
      ['мой', 'b'],
      ['c', 'чужой'],
    ]);
  });

  it('вставка и удаление строки сдвигают ячейки и меняют высоту', () => {
    const { actions, get } = setup();
    actions.update(new Map([['T', insertRow(get(), 1)!]]));
    expect(get().rows).toBe(3);
    expect(get().cells).toEqual([
      ['a', 'b'],
      ['', ''],
      ['c', 'd'],
    ]);
    expect(get().height).toBeCloseTo(150);
    actions.update(new Map([['T', deleteRow(get(), 0)!]]));
    expect(get().cells).toEqual([
      ['', ''],
      ['c', 'd'],
    ]);
    expect(get().height).toBeCloseTo(100);
  });

  it('вставка и удаление столбца', () => {
    const { actions, get } = setup();
    actions.update(new Map([['T', insertColumn(get(), 0)!]]));
    expect(get().cells).toEqual([
      ['', 'a', 'b'],
      ['', 'c', 'd'],
    ]);
    actions.update(new Map([['T', deleteColumn(get(), 2)!]]));
    expect(get().cells).toEqual([
      ['', 'a'],
      ['', 'c'],
    ]);
    expect(deleteColumn({ ...get(), cols: 1 }, 0)).toBeNull();
  });

  it('раскладка по долям и ячейка под точкой', () => {
    const { get } = setup();
    expect(tableLayout(get())).toEqual({ xs: [0, 100, 200], ys: [0, 50, 100] });
    expect(cellAt(get(), { x: 150, y: 60 })).toEqual({ row: 1, col: 1 });
    expect(cellAt(get(), { x: 250, y: 60 })).toBeNull();
  });

  it('поиск находит текст ячеек', () => {
    const { store } = setup();
    expect(searchBoard(store.values(), [], 'd')[0]?.id).toBe('T');
  });
});
