import type * as Y from 'yjs';
import { Map as YMap } from 'yjs';
import type { BoardElement, Bounds, FrameElement } from '@prostor/shared';
import { compareRenderOrder } from '@/lib/canvas/frames';
import { boundsOf, changedElementIds, readElement } from '@/lib/canvas/read-element';
import { SpatialIndex } from '@/lib/canvas/spatial-index';

type Listener = () => void;

/**
 * Проекция Yjs-карты "elements" для рендера.
 *
 * - Каждый элемент — неизменяемый plain-объект; при изменении поля создаётся
 *   новый объект только для этого элемента. Ссылки остальных не меняются,
 *   и React.memo в ElementNode пропускает их ре-рендер.
 * - R-tree обновляется точечно по id из observeDeep — без полного пересчёта.
 * - version растёт на каждую транзакцию; React подписывается через
 *   useSyncExternalStore(subscribe, getVersion).
 */
export class ElementStore {
  private readonly elements = new Map<string, BoardElement>();
  private readonly index = new SpatialIndex();
  private readonly listeners = new Set<Listener>();
  /** Привязки линий: объект → линии, привязанные к нему концом */
  private readonly connectors = new Map<string, Set<string>>();
  /** Обратная сторона: линия → объекты её привязок (чтобы снять старые при изменении) */
  private readonly lineTargets = new Map<string, string[]>();
  private version = 0;

  constructor(private readonly ymap: Y.Map<unknown>) {
    this.loadAll();
    ymap.observeDeep(this.onChange);
  }

  private loadAll(): void {
    const entries: Array<{ id: string; bounds: Bounds }> = [];
    this.elements.clear();
    this.connectors.clear();
    this.lineTargets.clear();
    for (const [id, value] of this.ymap.entries()) {
      if (!(value instanceof YMap)) continue;
      const el = readElement(id, value as Y.Map<unknown>);
      if (!el) continue;
      this.elements.set(id, el);
      this.indexBindings(id, el);
      entries.push({ id, bounds: boundsOf(el) });
    }
    this.index.load(entries);
  }

  private readonly onChange = (events: Array<Y.YEvent<Y.AbstractType<unknown>>>): void => {
    const ids = changedElementIds(events, this.ymap);
    if (ids.size === 0) return;

    // Пакетная загрузка (импорт, генерация, первая синхронизация) — дешевле
    // пересобрать дерево целиком, чем делать тысячи remove/insert.
    if (ids.size > 1_000) {
      this.loadAll();
    } else {
      for (const id of ids) this.refresh(id);
    }
    this.version++;
    for (const l of this.listeners) l();
  };

  private refresh(id: string): void {
    const value = this.ymap.get(id);
    const el = value instanceof YMap ? readElement(id, value as Y.Map<unknown>) : null;
    if (!el) {
      this.elements.delete(id);
      this.index.remove(id);
      this.indexBindings(id, null);
      return;
    }
    this.elements.set(id, el);
    this.indexBindings(id, el);
    this.index.upsert(id, boundsOf(el));
  }

  private indexBindings(id: string, el: BoardElement | null): void {
    for (const target of this.lineTargets.get(id) ?? []) {
      const set = this.connectors.get(target);
      set?.delete(id);
      if (set?.size === 0) this.connectors.delete(target);
    }
    this.lineTargets.delete(id);
    if (!el || (el.type !== 'line' && el.type !== 'arrow')) return;
    const targets = [el.startBinding?.elementId, el.endBinding?.elementId].filter(
      (t): t is string => typeof t === 'string',
    );
    if (targets.length === 0) return;
    this.lineTargets.set(id, targets);
    for (const target of targets) {
      let set = this.connectors.get(target);
      if (!set) this.connectors.set(target, (set = new Set()));
      set.add(id);
    }
  }

  /** Линии, привязанные к любому из объектов */
  connectorsOf(ids: Iterable<string>): Set<string> {
    const result = new Set<string>();
    for (const id of ids) for (const line of this.connectors.get(id) ?? []) result.add(line);
    return result;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  get size(): number {
    return this.elements.size;
  }

  get(id: string): BoardElement | undefined {
    return this.elements.get(id);
  }

  /**
   * Элементы в области в порядке отрисовки: фреймы под всеми объектами,
   * дальше по zIndex. Скрытые элементы пропускаются.
   */
  query(bounds: Bounds): BoardElement[] {
    const result: BoardElement[] = [];
    for (const id of this.index.search(bounds)) {
      const el = this.elements.get(id);
      if (el && !el.hidden) result.push(el);
    }
    // fractional index — строки, сравнение лексикографическое (не localeCompare!)
    result.sort(compareRenderOrder);
    return result;
  }

  values(): IterableIterator<BoardElement> {
    return this.elements.values();
  }

  boundsOf(id: string): Bounds | null {
    return this.index.boundsOf(id);
  }

  /** Все элементы группы (группы небольшие; полный проход по 10k — ~1 мс, только при клике) */
  groupMembers(groupId: string): string[] {
    const ids: string[] = [];
    for (const el of this.elements.values()) if (el.groupId === groupId) ids.push(el.id);
    return ids;
  }

  /** Все фреймы доски (их единицы-десятки — полный проход дешёвый) */
  frames(): FrameElement[] {
    const result: FrameElement[] = [];
    for (const el of this.elements.values())
      if (el.type === 'frame') result.push(el as FrameElement);
    return result;
  }

  /** Объекты внутри фрейма */
  frameChildren(frameId: string): string[] {
    const ids: string[] = [];
    for (const el of this.elements.values()) if (el.frameId === frameId) ids.push(el.id);
    return ids;
  }

  /** Общие габариты набора элементов */
  boundsOfIds(ids: Iterable<string>): Bounds | null {
    let result: Bounds | null = null;
    for (const id of ids) {
      const b = this.index.boundsOf(id);
      if (!b) continue;
      result = result
        ? {
            minX: Math.min(result.minX, b.minX),
            minY: Math.min(result.minY, b.minY),
            maxX: Math.max(result.maxX, b.maxX),
            maxY: Math.max(result.maxY, b.maxY),
          }
        : { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
    }
    return result;
  }

  extent(): Bounds | null {
    return this.index.extent();
  }

  /** Обход габаритов всех элементов (мини-карта) — без создания массивов */
  forEachBounds(fn: (bounds: Bounds, element: BoardElement) => void): void {
    this.index.forEach((id, bounds) => {
      const el = this.elements.get(id);
      if (el && !el.hidden) fn(bounds, el);
    });
  }

  destroy(): void {
    this.ymap.unobserveDeep(this.onChange);
    this.listeners.clear();
    this.elements.clear();
    this.index.clear();
    this.connectors.clear();
    this.lineTargets.clear();
  }
}
