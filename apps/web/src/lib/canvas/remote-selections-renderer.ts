import Konva from 'konva';
import type { Awareness } from 'y-protocols/awareness';
import type { ElementStore } from '@/lib/canvas/element-store';

const MAX_IDS_PER_USER = 200;

function readSelection(state: unknown): { ids: string[]; color: string } | null {
  if (typeof state !== 'object' || state === null) return null;
  const s = state as { selection?: unknown; user?: { color?: unknown } };
  if (!Array.isArray(s.selection) || s.selection.length === 0) return null;
  const ids = s.selection
    .filter((id): id is string => typeof id === 'string')
    .slice(0, MAX_IDS_PER_USER);
  const color = typeof s.user?.color === 'string' ? s.user.color : '#64748b';
  return { ids, color };
}

/**
 * Что выделили коллеги: рамки их цвета вокруг объектов (по габаритам из
 * R-tree, поэтому работает и для неотрисованных/LOD-объектов).
 * Перерисовывается только при смене чьего-то выделения или данных доски,
 * а не на каждое движение курсора (сравнение по сериализованному ключу).
 */
export class RemoteSelectionsRenderer {
  private readonly group = new Konva.Group({ listening: false });
  private lastKey = '';

  constructor(
    private readonly layer: Konva.Layer,
    private readonly awareness: Awareness,
    private readonly store: ElementStore,
    private readonly getZoom: () => number,
  ) {
    layer.add(this.group);
    awareness.on('change', this.onAwareness);
    this.unsubscribe = store.subscribe(this.redraw);
    this.redraw();
  }

  private readonly unsubscribe: () => void;

  private collect(): Array<{ ids: string[]; color: string }> {
    const result: Array<{ ids: string[]; color: string }> = [];
    for (const [clientId, state] of this.awareness.getStates()) {
      if (clientId === this.awareness.clientID) continue;
      const sel = readSelection(state);
      if (sel) result.push(sel);
    }
    return result;
  }

  private readonly onAwareness = (): void => {
    const key = JSON.stringify(this.collect());
    if (key !== this.lastKey) this.redraw();
  };

  private readonly redraw = (): void => {
    const selections = this.collect();
    this.lastKey = JSON.stringify(selections);
    this.group.destroyChildren();
    const px = 1 / this.getZoom();
    for (const { ids, color } of selections) {
      for (const id of ids) {
        const b = this.store.boundsOf(id);
        if (!b) continue;
        this.group.add(
          new Konva.Rect({
            x: b.minX - 3 * px,
            y: b.minY - 3 * px,
            width: b.maxX - b.minX + 6 * px,
            height: b.maxY - b.minY + 6 * px,
            stroke: color,
            strokeWidth: 2 * px,
            cornerRadius: 3 * px,
            listening: false,
          }),
        );
      }
    }
    this.layer.batchDraw();
  };

  /** Толщина рамок зависит от zoom — вызывается при смене уровня масштаба */
  refresh(): void {
    this.redraw();
  }

  destroy(): void {
    this.awareness.off('change', this.onAwareness);
    this.unsubscribe();
    this.group.destroy();
  }
}
