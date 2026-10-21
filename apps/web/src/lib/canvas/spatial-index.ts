import RBush from 'rbush';
import type { Bounds } from '@prostor/shared';

interface IndexItem extends Bounds {
  id: string;
}

/**
 * R-tree (rbush) по bounding box элементов.
 * Запрос «что попадает в видимую область» — O(log n + k) вместо перебора
 * всех 10 000 элементов на каждом кадре панорамирования.
 *
 * rbush не умеет обновлять элемент на месте: update = remove + insert.
 * Поэтому храним ссылки на вставленные объекты по id.
 */
export class SpatialIndex {
  private readonly tree = new RBush<IndexItem>(16);
  private readonly items = new Map<string, IndexItem>();

  get size(): number {
    return this.items.size;
  }

  /** Массовая загрузка (bulk load) — в разы быстрее поштучной вставки при открытии доски */
  load(entries: Array<{ id: string; bounds: Bounds }>): void {
    this.clear();
    const items = entries.map(({ id, bounds }) => ({ id, ...bounds }));
    for (const item of items) this.items.set(item.id, item);
    this.tree.load(items);
  }

  upsert(id: string, bounds: Bounds): void {
    const existing = this.items.get(id);
    if (existing) {
      if (
        existing.minX === bounds.minX &&
        existing.minY === bounds.minY &&
        existing.maxX === bounds.maxX &&
        existing.maxY === bounds.maxY
      ) {
        return;
      }
      this.tree.remove(existing);
    }
    const item: IndexItem = { id, ...bounds };
    this.items.set(id, item);
    this.tree.insert(item);
  }

  remove(id: string): void {
    const existing = this.items.get(id);
    if (!existing) return;
    this.tree.remove(existing);
    this.items.delete(id);
  }

  search(bounds: Bounds): string[] {
    return this.tree.search(bounds).map((item) => item.id);
  }

  boundsOf(id: string): Bounds | null {
    return this.items.get(id) ?? null;
  }

  /** Габариты всего содержимого (для «показать всё» и мини-карты) */
  extent(): Bounds | null {
    if (this.items.size === 0) return null;
    const { minX, minY, maxX, maxY } = this.tree.toJSON() as Bounds;
    return { minX, minY, maxX, maxY };
  }

  forEach(fn: (id: string, bounds: Bounds) => void): void {
    for (const item of this.items.values()) fn(item.id, item);
  }

  clear(): void {
    this.tree.clear();
    this.items.clear();
  }
}
