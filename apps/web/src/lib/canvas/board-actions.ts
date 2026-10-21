import { generateNKeysBetween } from 'fractional-indexing';
import * as Y from 'yjs';
import {
  LOCAL_ORIGIN,
  Y_KEYS,
  can,
  type BoardElement,
  type BoardRole,
  type Bounds,
  type OrgPolicy,
} from '@prostor/shared';
import { cloneForPaste, parseClipboard, serializeElements } from '@/lib/canvas/clipboard';
import { insertElements, maxZIndex, minZIndex, newElementId } from '@/lib/canvas/element-factory';
import type { ElementStore } from '@/lib/canvas/element-store';
import { centerOf, frameFor } from '@/lib/canvas/frames';
import { boundsOf } from '@/lib/canvas/read-element';
import { plainToRich, richToFragment } from '@/lib/rich-text/yjs-convert';

export interface ActionContext {
  doc: Y.Doc;
  store: ElementStore;
  userId: string;
  role: BoardRole;
  policy: OrgPolicy;
  /** Аноним на публичной доске: смотреть может, комментировать — нет (нужен аккаунт) */
  anonymous?: boolean;
  /** Для границ шагов отмены (stopCapturing); без него undo просто не размечается */
  undoManager?: Y.UndoManager | null;
}

export type ElementPatch = Partial<Record<string, unknown>>;

/**
 * Все изменения доски из UI проходят здесь.
 *
 * - Каждое действие — одна Yjs-транзакция с origin LOCAL_ORIGIN:
 *   один апдейт по сети и один шаг undo (Y.UndoManager отслеживает этот origin).
 * - Y.UndoManager склеивает изменения в пределах captureTimeout (500 мс). Это нужно
 *   для жестов (перетаскивание — десятки транзакций), но не для дискретных действий:
 *   Ctrl+D и Delete подряд должны отменяться по отдельности. Поэтому дискретное
 *   действие начинается с stopCapturing(), а жест открывается beginGesture() и пишет с merge.
 * - Здесь же клиентские проверки прав (роль, политики организации,
 *   locked). Сервер дополнительно не принимает правки от VIEWER/GUEST;
 *   проверку «удаление чужих объектов» на сервере добавит итерация 8.
 */
export class BoardActions {
  constructor(private readonly ctx: ActionContext) {}

  private get elements(): Y.Map<unknown> {
    return this.ctx.doc.getMap<unknown>(Y_KEYS.elements);
  }

  private transact(fn: () => void, merge = false): void {
    if (!merge) this.ctx.undoManager?.stopCapturing();
    this.ctx.doc.transact(fn, LOCAL_ORIGIN);
  }

  /** Начало жеста (перетаскивание, набор текста): последующие правки с merge — один шаг undo */
  beginGesture(): void {
    this.ctx.undoManager?.stopCapturing();
  }

  private ymap(id: string): Y.Map<unknown> | null {
    const value = this.elements.get(id);
    return value instanceof Y.Map ? (value as Y.Map<unknown>) : null;
  }

  private get(ids: Iterable<string>): BoardElement[] {
    const result: BoardElement[] = [];
    for (const id of ids) {
      const el = this.ctx.store.get(id);
      if (el) result.push(el);
    }
    return result;
  }

  get canEdit(): boolean {
    return can(this.ctx.role, 'edit', this.ctx.policy);
  }

  get canComment(): boolean {
    return !this.ctx.anonymous && can(this.ctx.role, 'comment', this.ctx.policy);
  }

  get canExport(): boolean {
    return can(this.ctx.role, 'export', this.ctx.policy);
  }

  get canCopy(): boolean {
    return can(this.ctx.role, 'copy', this.ctx.policy);
  }

  canDelete(el: BoardElement): boolean {
    if (!this.canEdit || el.locked) return false;
    return el.createdBy === this.ctx.userId || can(this.ctx.role, 'deleteOthers', this.ctx.policy);
  }

  /** Клик по элементу группы выделяет всю группу */
  expandGroups(ids: Iterable<string>): string[] {
    const result = new Set<string>();
    const seenGroups = new Set<string>();
    for (const el of this.get(ids)) {
      if (el.groupId && !seenGroups.has(el.groupId)) {
        seenGroups.add(el.groupId);
        for (const member of this.ctx.store.groupMembers(el.groupId)) result.add(member);
      }
      result.add(el.id);
    }
    return Array.from(result);
  }

  /**
   * Y.XmlFragment форматированного текста элемента для редактора (y-prosemirror).
   * У объектов, созданных до итерации 7b или без форматирования, его ещё нет —
   * создаём из плоского текста при первом открытии редактора (тем же шагом
   * отмены, что и правка). Если два человека откроют такой объект одновременно,
   * Yjs оставит один фрагмент, а редактор второго переподключится к нему.
   */
  ensureRichContent(id: string): Y.XmlFragment | null {
    const map = this.ymap(id);
    if (!map || !this.canEdit) return null;
    const existing = map.get('content');
    if (existing instanceof Y.XmlFragment) return existing;
    const text = map.get('text');
    this.transact(() => {
      map.set('content', richToFragment(plainToRich(typeof text === 'string' ? text : '')));
    }, true);
    const created = map.get('content');
    return created instanceof Y.XmlFragment ? created : null;
  }

  /** Y.Map элемента — для подписок редактора (замена фрагмента коллегой) */
  elementMap(id: string): Y.Map<unknown> | null {
    return this.ymap(id);
  }

  /** Выделенные фреймы тянут за собой содержимое (перемещение, удаление, копирование) */
  withFrameChildren(ids: Iterable<string>): string[] {
    const result = new Set(ids);
    for (const el of this.get(result)) {
      if (el.type === 'frame') for (const child of this.ctx.store.frameChildren(el.id)) result.add(child);
    }
    return Array.from(result);
  }

  /**
   * Пересчёт принадлежности к фреймам для ids (после перемещения, вставки,
   * изменения размеров). merge — тем же шагом отмены, что и само действие.
   */
  reparent(ids: Iterable<string>, merge = true): void {
    if (!this.canEdit) return;
    const patches = new Map<string, ElementPatch>();
    for (const el of this.get(ids)) {
      if (el.type === 'frame') continue;
      const c = centerOf(boundsOf(el));
      const frame = frameFor(el, this.ctx.store.query({ minX: c.x, minY: c.y, maxX: c.x, maxY: c.y }));
      const next = frame?.id;
      if (next !== el.frameId) patches.set(el.id, { frameId: next });
    }
    if (patches.size > 0) this.update(patches, merge);
  }

  /** Пересчёт для всего, что лежит в области (создание фрейма, изменение его размеров) */
  reparentIn(bounds: Bounds, extraIds: Iterable<string> = []): void {
    const ids = new Set(extraIds);
    for (const el of this.ctx.store.query(bounds)) ids.add(el.id);
    this.reparent(ids);
  }

  /** Перемещаемые элементы (без заблокированных) с исходными координатами */
  movable(ids: Iterable<string>): Map<string, { x: number; y: number }> {
    const origins = new Map<string, { x: number; y: number }>();
    if (!this.canEdit) return origins;
    for (const el of this.get(ids)) if (!el.locked) origins.set(el.id, { x: el.x, y: el.y });
    return origins;
  }

  /** Перемещение от исходных позиций (во время перетаскивания вызывается каждый кадр — с merge) */
  moveFrom(
    origins: ReadonlyMap<string, { x: number; y: number }>,
    dx: number,
    dy: number,
    merge = false,
  ): void {
    if (origins.size === 0) return;
    const now = Date.now();
    this.transact(() => {
      for (const [id, o] of origins) {
        const map = this.ymap(id);
        if (!map) continue;
        map.set('x', Math.round((o.x + dx) * 100) / 100);
        map.set('y', Math.round((o.y + dy) * 100) / 100);
        map.set('updatedAt', now);
      }
    }, merge);
  }

  nudge(ids: Iterable<string>, dx: number, dy: number): void {
    this.moveFrom(this.movable(ids), dx, dy);
  }

  update(patches: ReadonlyMap<string, ElementPatch>, merge = false): void {
    if (!this.canEdit || patches.size === 0) return;
    const now = Date.now();
    this.transact(() => {
      for (const [id, patch] of patches) {
        const map = this.ymap(id);
        if (!map) continue;
        for (const [key, value] of Object.entries(patch)) {
          if (key === 'id' || key === 'type') continue;
          if (value === undefined) map.delete(key);
          else map.set(key, value);
        }
        map.set('updatedAt', now);
      }
    }, merge);
  }

  /** Одинаковое изменение стиля для набора (цвет, толщина…) */
  setStyle(ids: Iterable<string>, patch: ElementPatch): void {
    const patches = new Map<string, ElementPatch>();
    for (const el of this.get(ids)) {
      if (el.locked) continue;
      const applicable: ElementPatch = {};
      for (const [key, value] of Object.entries(patch)) if (key in el) applicable[key] = value;
      if (Object.keys(applicable).length > 0) patches.set(el.id, applicable);
    }
    this.update(patches);
  }

  create(elements: readonly BoardElement[]): string[] {
    if (!this.canEdit || elements.length === 0) return [];
    this.transact(() => insertElements(this.ctx.doc, elements));
    const ids = elements.map((el) => el.id);
    // Созданное (стикер кликом, вставка, дубликат) в области фрейма попадает в него — тем же шагом отмены
    this.reparent(ids);
    return ids;
  }

  /** Удаление; возвращает число пропущенных (заблокированные / чужие при запрете политики) */
  delete(ids: Iterable<string>): { deleted: number; skipped: number } {
    const all = this.get(this.withFrameChildren(ids));
    const deletable = all.filter((el) => this.canDelete(el));
    if (deletable.length > 0) {
      this.transact(() => {
        for (const el of deletable) this.elements.delete(el.id);
      });
    }
    return { deleted: deletable.length, skipped: all.length - deletable.length };
  }

  duplicate(ids: Iterable<string>, offset = 24): string[] {
    if (!this.canEdit || !this.canCopy) return [];
    const copies = cloneForPaste(this.get(this.withFrameChildren(ids)), {
      dx: offset,
      dy: offset,
      userId: this.ctx.userId,
      maxZ: maxZIndex(this.elements),
    });
    return this.create(copies);
  }

  group(ids: Iterable<string>): string | null {
    const els = this.get(ids).filter((el) => !el.locked);
    if (!this.canEdit || els.length < 2) return null;
    const groupId = newElementId();
    this.update(new Map(els.map((el) => [el.id, { groupId }])));
    return groupId;
  }

  ungroup(ids: Iterable<string>): void {
    const els = this.get(ids).filter((el) => el.groupId);
    this.update(new Map(els.map((el) => [el.id, { groupId: undefined }])));
  }

  /** На передний план: новые zIndex выше максимума с сохранением взаимного порядка */
  bringToFront(ids: Iterable<string>): void {
    const els = this.sortByZ(this.get(ids));
    const keys = generateNKeysBetween(maxZIndex(this.elements), null, els.length);
    this.update(new Map(els.map((el, i) => [el.id, { zIndex: keys[i] }])));
  }

  sendToBack(ids: Iterable<string>): void {
    const els = this.sortByZ(this.get(ids));
    const keys = generateNKeysBetween(null, minZIndex(this.elements), els.length);
    this.update(new Map(els.map((el, i) => [el.id, { zIndex: keys[i] }])));
  }

  toggleLock(ids: Iterable<string>): void {
    if (!this.canEdit) return;
    const els = this.get(ids);
    const lock = els.some((el) => !el.locked);
    const now = Date.now();
    // Мимо update(): он пропускает заблокированные, а здесь как раз снимаем блокировку
    this.transact(() => {
      for (const el of els) {
        const map = this.ymap(el.id);
        map?.set('locked', lock);
        map?.set('updatedAt', now);
      }
    });
  }

  serialize(ids: Iterable<string>): string | null {
    if (!this.canCopy) return null;
    const els = this.get(this.withFrameChildren(ids));
    return els.length > 0 ? serializeElements(els) : null;
  }

  /**
   * Вставка из буфера. at — мировая точка (курсор): набор центрируется на ней;
   * без at — сдвиг на 24 от исходного места (как дублирование).
   */
  paste(text: string, at: { x: number; y: number } | null): string[] | null {
    const parsed = parseClipboard(text);
    if (!parsed || parsed.length === 0 || !this.canEdit) return null;
    let dx = 24;
    let dy = 24;
    if (at) {
      const minX = Math.min(...parsed.map((el) => el.x));
      const minY = Math.min(...parsed.map((el) => el.y));
      const maxX = Math.max(...parsed.map((el) => el.x + el.width));
      const maxY = Math.max(...parsed.map((el) => el.y + el.height));
      dx = at.x - (minX + maxX) / 2;
      dy = at.y - (minY + maxY) / 2;
    }
    const copies = cloneForPaste(parsed, {
      dx,
      dy,
      userId: this.ctx.userId,
      maxZ: maxZIndex(this.elements),
    });
    return this.create(copies);
  }

  private sortByZ(els: BoardElement[]): BoardElement[] {
    return els.sort((a, b) => (a.zIndex < b.zIndex ? -1 : a.zIndex > b.zIndex ? 1 : 0));
  }
}
