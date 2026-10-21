import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  DEFAULT_POLICY,
  LOCAL_ORIGIN,
  Y_KEYS,
  type BoardRole,
  type OrgPolicy,
} from '@prostor/shared';
import { BoardActions } from './board-actions';
import { serializeElements } from './clipboard';
import { buildFrame, buildSticky, insertElements } from './element-factory';
import { ElementStore } from './element-store';

function setup(opts: { role?: BoardRole; policy?: Partial<OrgPolicy>; userId?: string } = {}) {
  const doc = new Y.Doc();
  const store = new ElementStore(doc.getMap(Y_KEYS.elements));
  const undo = new Y.UndoManager(doc.getMap(Y_KEYS.elements), {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
  });
  const actions = new BoardActions({
    doc,
    store,
    userId: opts.userId ?? 'me',
    role: opts.role ?? 'EDITOR',
    policy: { ...DEFAULT_POLICY, ...opts.policy },
    undoManager: undo,
  });
  const add = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => {
    const el = {
      ...buildSticky({ x, y, userId: 'me', zIndex: `a${id}`, fill: '#ff0' }),
      id,
      ...extra,
    };
    doc.transact(() => insertElements(doc, [el as never]), 'setup');
    return el;
  };
  return { doc, store, undo, actions, add };
}

describe('BoardActions', () => {
  it('перетаскивание (жест) — один шаг undo на много транзакций', () => {
    const { actions, store, undo, add } = setup();
    add('1', 0, 0);
    add('2', 100, 0);
    const origins = actions.movable(['1', '2']);
    actions.beginGesture();
    actions.moveFrom(origins, 10, 5, true);
    actions.moveFrom(origins, 30, 15, true);
    expect(store.get('1')).toMatchObject({ x: 30, y: 15 });
    expect(store.get('2')).toMatchObject({ x: 130, y: 15 });
    undo.stopCapturing();
    undo.undo();
    expect(store.get('1')).toMatchObject({ x: 0, y: 0 });
  });

  it('заблокированные элементы не двигаются и не удаляются', () => {
    const { actions, store, add } = setup();
    add('1', 0, 0, { locked: true });
    actions.nudge(['1'], 10, 0);
    expect(store.get('1')?.x).toBe(0);
    expect(actions.delete(['1'])).toEqual({ deleted: 0, skipped: 1 });
  });

  it('политика запрещает удалять чужие объекты, но не свои', () => {
    const { actions, add } = setup({ policy: { allowDeleteOthers: false } });
    add('mine', 0, 0);
    add('theirs', 0, 0, { createdBy: 'someone-else' });
    expect(actions.delete(['mine', 'theirs'])).toEqual({ deleted: 1, skipped: 1 });
  });

  it('VIEWER ничего не меняет', () => {
    const { actions, store, add } = setup({ role: 'VIEWER' });
    add('1', 0, 0);
    actions.nudge(['1'], 10, 0);
    expect(actions.delete(['1']).deleted).toBe(0);
    expect(actions.duplicate(['1'])).toEqual([]);
    expect(store.get('1')?.x).toBe(0);
  });

  it('дублирование: новые id, сдвиг, поверх остальных, группы переназначены', () => {
    const { actions, store, add } = setup();
    add('1', 0, 0, { groupId: 'g' });
    add('2', 50, 0, { groupId: 'g' });
    const copies = actions.duplicate(['1', '2']);
    expect(copies).toHaveLength(2);
    const [a, b] = copies.map((id) => store.get(id));
    expect(a?.x).toBe(24);
    expect(a?.groupId).toBeTruthy();
    expect(a?.groupId).not.toBe('g');
    expect(a?.groupId).toBe(b?.groupId);
    expect((a?.zIndex ?? '') > 'a2').toBe(true);
  });

  it('группировка и раскрытие группы при выделении', () => {
    const { actions, add } = setup();
    add('1', 0, 0);
    add('2', 50, 0);
    add('3', 500, 0);
    const groupId = actions.group(['1', '2']);
    expect(groupId).toBeTruthy();
    expect(actions.expandGroups(['1']).sort()).toEqual(['1', '2']);
    actions.ungroup(['1', '2']);
    expect(actions.expandGroups(['1'])).toEqual(['1']);
  });

  it('на передний / задний план', () => {
    const { actions, store, add } = setup();
    add('1', 0, 0);
    add('2', 0, 0);
    add('3', 0, 0);
    actions.bringToFront(['1']);
    expect(store.query({ minX: -1, minY: -1, maxX: 10, maxY: 10 }).map((e) => e.id)).toEqual([
      '2',
      '3',
      '1',
    ]);
    actions.sendToBack(['3']);
    expect(store.query({ minX: -1, minY: -1, maxX: 10, maxY: 10 }).map((e) => e.id)).toEqual([
      '3',
      '2',
      '1',
    ]);
  });

  it('копирование и вставка в точку курсора', () => {
    const { actions, store, add } = setup();
    add('1', 0, 0);
    const text = actions.serialize(['1']);
    expect(text).toBeTruthy();
    const pasted = actions.paste(text ?? '', { x: 1000, y: 1000 }) ?? [];
    expect(pasted).toHaveLength(1);
    // Центр вставленного стикера (200×200) — в точке курсора
    expect(store.get(pasted[0] ?? '')).toMatchObject({ x: 900, y: 900 });
  });

  it('запрет копирования политикой', () => {
    const { actions, add } = setup({ policy: { allowCopy: false } });
    add('1', 0, 0);
    expect(actions.serialize(['1'])).toBeNull();
    expect(actions.duplicate(['1'])).toEqual([]);
  });

  it('вставка отбрасывает невалидные элементы из буфера', () => {
    const { actions, store } = setup();
    const good = buildSticky({ x: 0, y: 0, userId: 'x', zIndex: 'a0', fill: '#fff' });
    const text = serializeElements([
      good,
      { ...good, id: 'bad', type: 'sticky', x: 'NaN' } as never,
    ]);
    expect(actions.paste(text, null)).toHaveLength(1);
    expect(store.size).toBe(1);
    expect(actions.paste('просто текст', null)).toBeNull();
  });

  it('стиль применяется только к подходящим полям', () => {
    const { actions, store, add } = setup();
    add('1', 0, 0);
    actions.setStyle(['1'], { fill: '#bbf7d0', stroke: '#000' });
    expect(store.get('1')).toMatchObject({ fill: '#bbf7d0' });
    expect('stroke' in (store.get('1') ?? {})).toBe(false);
  });

  it('дискретные действия подряд — отдельные шаги undo (не склеиваются по captureTimeout)', () => {
    const { actions, store, undo, add } = setup();
    add('1', 0, 0);
    const copies = actions.duplicate(['1']);
    actions.delete(copies);
    expect(store.size).toBe(1);
    undo.undo();
    // Отменилось только удаление — копия вернулась
    expect(store.size).toBe(2);
    undo.undo();
    expect(store.size).toBe(1);
  });
});

describe('BoardActions: фреймы', () => {
  function withFrame() {
    const ctx = setup();
    const frame = {
      ...buildFrame({
        x: 0,
        y: 0,
        width: 1000,
        height: 600,
        title: 'Фрейм 1',
        userId: 'me',
        zIndex: 'a0',
      }),
      id: 'frame',
    };
    ctx.doc.transact(() => insertElements(ctx.doc, [frame]), 'setup');
    return ctx;
  }

  it('объект, перенесённый центром во фрейм, становится его содержимым, и наоборот', () => {
    const { actions, store, add } = withFrame();
    add('s', 2000, 0);
    actions.nudge(['s'], -1800, 100);
    actions.reparent(['s']);
    expect(store.get('s')?.frameId).toBe('frame');
    actions.nudge(['s'], 5000, 0);
    actions.reparent(['s']);
    expect(store.get('s')?.frameId).toBeUndefined();
  });

  it('перемещение и удаление фрейма захватывают содержимое', () => {
    const { actions, store, add } = withFrame();
    add('in', 100, 100, { frameId: 'frame' });
    add('out', 3000, 0);
    actions.moveFrom(actions.movable(actions.withFrameChildren(['frame'])), 50, 0);
    expect(store.get('in')).toMatchObject({ x: 150 });
    expect(store.get('out')).toMatchObject({ x: 3000 });
    actions.delete(['frame']);
    expect(store.get('in')).toBeUndefined();
    expect(store.get('out')).toBeDefined();
  });

  it('дублирование фрейма копирует содержимое с новыми связями', () => {
    const { actions, store, add } = withFrame();
    add('in', 100, 100, { frameId: 'frame' });
    const copies = actions.duplicate(['frame']);
    expect(copies).toHaveLength(2);
    const frameCopy = copies.map((id) => store.get(id)).find((el) => el?.type === 'frame');
    const childCopy = copies.map((id) => store.get(id)).find((el) => el?.type === 'sticky');
    expect(childCopy?.frameId).toBe(frameCopy?.id);
  });

  it('фреймы рисуются под объектами независимо от zIndex', () => {
    const { store, add } = withFrame();
    add('low', 10, 10, { zIndex: 'Zz' }); // меньше zIndex фрейма 'a0'
    expect(store.query({ minX: 0, minY: 0, maxX: 100, maxY: 100 }).map((e) => e.id)).toEqual([
      'frame',
      'low',
    ]);
  });
});
