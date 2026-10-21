import Konva from 'konva';
import type { Awareness } from 'y-protocols/awareness';
import { LASER_LIFETIME_MS, pruneTrail, toLocalTime, type TrailPoint } from '@/lib/canvas/laser-trail';

const SEND_INTERVAL_MS = 40;
const MAX_SENT_POINTS = 48;
const WIDTH_PX = 4;

interface Trail {
  color: string;
  points: TrailPoint[];
}

/**
 * Лазерная указка: свой след и следы коллег на слое курсоров.
 * Императивно (Konva.Shape + rAF), без React: след обновляется каждый кадр.
 * Свой след уходит коллегам через awareness.laser не чаще 25 раз в секунду.
 */
export class LaserRenderer {
  private readonly shape: Konva.Shape;
  private readonly own: Trail;
  private readonly remote = new Map<number, Trail>();
  private frame = 0;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = 0;

  constructor(
    private readonly layer: Konva.Layer,
    private readonly awareness: Awareness | null,
    private readonly getZoom: () => number,
    color: string,
  ) {
    this.own = { color, points: [] };
    this.shape = new Konva.Shape({ listening: false, sceneFunc: (ctx) => this.draw(ctx) });
    layer.add(this.shape);
    awareness?.on('change', this.onAwareness);
  }

  /** Новая точка своего следа (мировые координаты) */
  add(x: number, y: number): void {
    this.own.points.push({ x, y, t: performance.now() });
    this.schedule();
    this.scheduleSend();
  }

  /** Отпустили кнопку — след догорает сам, коллегам больше не шлём */
  end(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    this.awareness?.setLocalStateField('laser', null);
  }

  private scheduleSend(): void {
    if (!this.awareness || this.sendTimer) return;
    const wait = Math.max(0, SEND_INTERVAL_MS - (Date.now() - this.lastSent));
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      this.lastSent = Date.now();
      const now = performance.now();
      const pts = pruneTrail(this.own.points, now).slice(-MAX_SENT_POINTS);
      // Время — по Date.now (общая шкала с другими вкладками этого клиента не нужна, важна разница)
      const base = Date.now() - now;
      this.awareness?.setLocalStateField(
        'laser',
        pts.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(base + p.t)]),
      );
    }, wait);
  }

  private readonly onAwareness = (): void => {
    if (!this.awareness) return;
    const now = performance.now();
    for (const [clientId, raw] of this.awareness.getStates()) {
      if (clientId === this.awareness.clientID) continue;
      const state = raw as { laser?: unknown; user?: { color?: unknown } };
      if (!Array.isArray(state.laser) || state.laser.length === 0) continue;
      const pts = (state.laser as unknown[]).filter(
        (p): p is [number, number, number] => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number'),
      );
      if (pts.length === 0) continue;
      const color = typeof state.user?.color === 'string' ? state.user.color : '#ef4444';
      // Каждый апдейт несёт весь свежий след (до 48 точек за последнюю секунду) — просто заменяем
      this.remote.set(clientId, { color, points: toLocalTime(pts, now) });
    }
    // Кто отпустил указку (laser = null), у того след догорает сам — в tick
    this.schedule();
  };

  private schedule(): void {
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (): void => {
    this.frame = 0;
    const now = performance.now();
    this.own.points = pruneTrail(this.own.points, now);
    let alive = this.own.points.length > 0;
    for (const [id, trail] of this.remote) {
      trail.points = pruneTrail(trail.points, now);
      if (trail.points.length === 0) this.remote.delete(id);
      else alive = true;
    }
    this.layer.batchDraw();
    if (alive) this.schedule();
  };

  private draw(ctx: Konva.Context): void {
    const now = performance.now();
    const width = WIDTH_PX / this.getZoom();
    for (const trail of [this.own, ...this.remote.values()]) {
      const pts = trail.points;
      if (pts.length === 0) continue;
      ctx.setAttr('lineCap', 'round');
      ctx.setAttr('lineJoin', 'round');
      ctx.setAttr('strokeStyle', trail === this.own ? '#ef4444' : trail.color);
      ctx.setAttr('shadowColor', trail === this.own ? '#ef4444' : trail.color);
      ctx.setAttr('shadowBlur', 8);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (!a || !b) continue;
        const life = 1 - (now - b.t) / LASER_LIFETIME_MS;
        if (life <= 0) continue;
        ctx.setAttr('globalAlpha', life);
        ctx.setAttr('lineWidth', width * (0.4 + 0.6 * life));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const head = pts[pts.length - 1];
      if (head && now - head.t < LASER_LIFETIME_MS) {
        ctx.setAttr('globalAlpha', 1);
        ctx.setAttr('fillStyle', '#fff');
        ctx.beginPath();
        ctx.arc(head.x, head.y, width * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.setAttr('globalAlpha', 1);
    ctx.setAttr('shadowBlur', 0);
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.awareness?.off('change', this.onAwareness);
    this.shape.destroy();
  }
}
