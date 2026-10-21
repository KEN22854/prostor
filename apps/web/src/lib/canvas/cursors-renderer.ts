import Konva from 'konva';
import type { Awareness } from 'y-protocols/awareness';
import type { Camera } from '@/lib/canvas/viewport';

interface RemoteCursor {
  group: Konva.Group;
  label: Konva.Text;
  tag: Konva.Rect;
  /** Текущая отрисованная позиция (интерполируется) */
  x: number;
  y: number;
  /** Последняя полученная позиция */
  targetX: number;
  targetY: number;
  name: string;
}

/** Доля пути к цели за кадр: ~6 кадров на догоняние = мягко, но без заметной задержки */
const LERP = 0.35;
/** Дальше этого (в экранных px) курсор не «летит», а сразу перескакивает */
const TELEPORT_SCREEN_PX = 600;

/**
 * Один шаг интерполяции курсора к цели. null — курсор уже на месте.
 * Чистая функция: тестируется без Konva и rAF.
 */
export function stepToward(
  current: { x: number; y: number },
  target: { x: number; y: number },
  zoom: number,
): { x: number; y: number } | null {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (Math.abs(dx) <= 0.01 && Math.abs(dy) <= 0.01) return null;
  // Если курсор «телепортировался» (коллега перешёл в другую часть доски), не тянем его через всю доску
  if (Math.hypot(dx, dy) * zoom > TELEPORT_SCREEN_PX) return { x: target.x, y: target.y };
  return { x: current.x + dx * LERP, y: current.y + dy * LERP };
}
const CURSOR_PATH = 'M0,0 L0,17 L4.5,12.5 L8,20 L11,18.7 L7.6,11.3 L13.5,11.3 Z';

function readCursor(state: unknown): { x: number; y: number; name: string; color: string } | null {
  if (typeof state !== 'object' || state === null) return null;
  const s = state as { cursor?: unknown; user?: unknown };
  const c = s.cursor as { x?: unknown; y?: unknown } | null | undefined;
  const u = s.user as { name?: unknown; color?: unknown } | undefined;
  if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') return null;
  return {
    x: c.x,
    y: c.y,
    name: typeof u?.name === 'string' ? u.name : 'Гость',
    color: typeof u?.color === 'string' ? u.color : '#64748b',
  };
}

/**
 * Курсоры коллег на отдельном Konva-слое, управляемом императивно.
 *
 * Почему не React: курсоры двигаются 20 раз в секунду у каждого из
 * десятков пользователей. Через React это были бы постоянные ре-рендеры;
 * здесь awareness лишь обновляет цели, а собственный rAF-цикл плавно
 * интерполирует позиции и рисует только этот слой (batchDraw).
 *
 * Курсор имеет постоянный экранный размер: группа масштабируется на 1/zoom.
 */
export class CursorsRenderer {
  private readonly cursors = new Map<number, RemoteCursor>();
  private frame = 0;
  private lastZoom = 0;

  constructor(
    private readonly layer: Konva.Layer,
    private readonly awareness: Awareness,
    private readonly getCamera: () => Camera,
  ) {
    awareness.on('change', this.sync);
    this.sync();
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly sync = (): void => {
    const states = this.awareness.getStates();
    const seen = new Set<number>();
    for (const [clientId, state] of states) {
      if (clientId === this.awareness.clientID) continue;
      const cursor = readCursor(state);
      if (!cursor) continue;
      seen.add(clientId);
      const existing = this.cursors.get(clientId);
      if (existing) {
        existing.targetX = cursor.x;
        existing.targetY = cursor.y;
        if (existing.name !== cursor.name) {
          existing.name = cursor.name;
          existing.label.text(cursor.name);
          existing.tag.width(existing.label.width());
        }
      } else {
        this.cursors.set(clientId, this.create(cursor));
      }
    }
    for (const [clientId, cursor] of this.cursors) {
      if (!seen.has(clientId)) {
        cursor.group.destroy();
        this.cursors.delete(clientId);
      }
    }
  };

  private create(c: { x: number; y: number; name: string; color: string }): RemoteCursor {
    // Масштаб сразу, а не с первого кадра rAF: в фоновой вкладке rAF приостановлен
    const scale = 1 / this.getCamera().zoom;
    const group = new Konva.Group({
      x: c.x,
      y: c.y,
      scaleX: scale,
      scaleY: scale,
      listening: false,
    });
    group.add(
      new Konva.Path({ data: CURSOR_PATH, fill: c.color, stroke: '#ffffff', strokeWidth: 1.2 }),
    );
    const label = new Konva.Text({
      x: 14,
      y: 20,
      text: c.name,
      fontSize: 12,
      fontFamily: 'Inter, system-ui, sans-serif',
      fill: '#ffffff',
      padding: 5,
    });
    const tag = new Konva.Rect({
      x: 14,
      y: 20,
      width: label.width(),
      height: label.height(),
      fill: c.color,
      cornerRadius: 4,
    });
    group.add(tag, label);
    this.layer.add(group);
    return { group, label, tag, x: c.x, y: c.y, targetX: c.x, targetY: c.y, name: c.name };
  }

  private readonly tick = (): void => {
    let dirty = false;
    const zoom = this.getCamera().zoom;
    const scale = 1 / zoom;
    const zoomChanged = zoom !== this.lastZoom;
    this.lastZoom = zoom;

    for (const c of this.cursors.values()) {
      const next = stepToward(c, { x: c.targetX, y: c.targetY }, zoom);
      if (next) {
        c.x = next.x;
        c.y = next.y;
        c.group.position(next);
        dirty = true;
      }
      if (zoomChanged) {
        c.group.scale({ x: scale, y: scale });
        dirty = true;
      }
    }
    if (dirty) this.layer.batchDraw();
    this.frame = requestAnimationFrame(this.tick);
  };

  get count(): number {
    return this.cursors.size;
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.awareness.off('change', this.sync);
    for (const c of this.cursors.values()) c.group.destroy();
    this.cursors.clear();
  }
}
