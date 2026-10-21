import type Konva from 'konva';
import { CANVAS, type BoardElement, type Bounds, type LineElement } from '@prostor/shared';
import type { BoardActions } from '@/lib/canvas/board-actions';
import {
  STICKY_SIZE,
  buildFrame,
  buildLine,
  buildPath,
  buildShape,
  buildSticky,
  buildTable,
  buildText,
} from '@/lib/canvas/element-factory';
import { cellAt } from '@/lib/canvas/table';
import { anchorAt, isBindable, lineEnds, routeLine } from '@/lib/canvas/connectors';
import type { ElementStore } from '@/lib/canvas/element-store';
import type { LaserRenderer } from '@/lib/canvas/laser-renderer';
import { nextFrameTitle } from '@/lib/canvas/frames';
import { rectFromPoints, translateBounds } from '@/lib/canvas/geometry';
import { elementsInRect, hitElement, pointQuery, topmostAt } from '@/lib/canvas/hit-test';
import type { OverlayRenderer } from '@/lib/canvas/overlay-renderer';
import { simplifyPoints } from '@/lib/canvas/simplify';
import { computeSnap, snapPointToGrid } from '@/lib/canvas/snapping';
import { visibleBounds, type Point } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';
import { useCommentsStore } from '@/stores/comments-store';
import { castVote, useVotingStore } from '@/stores/voting-store';

/** Сдвиг до начала перетаскивания: клик с дрожанием руки не должен двигать объект */
const DRAG_THRESHOLD_PX = 3;
const SNAP_PX = 6;
const HIT_TOLERANCE_PX = 4;
const ERASER_RADIUS_PX = 8;
/** Радиус ручки конца линии и «прилипания» к середине стороны объекта, экранные px */
const HANDLE_PX = 9;
const SIDE_SNAP_PX = 14;
/** Больше стольких объектов — перетаскиваем визуально, а в Yjs пишем один раз в конце */
const LIVE_MOVE_LIMIT = 150;
const EDITABLE: ReadonlySet<BoardElement['type']> = new Set(['sticky', 'text', 'shape']);
const VOTABLE: ReadonlySet<BoardElement['type']> = new Set(['sticky', 'text', 'shape', 'image']);

export interface ControllerDeps {
  store: ElementStore;
  actions: () => BoardActions | null;
  overlay: OverlayRenderer;
  user: () => { id: string; name: string } | null;
  /** Konva-ноды отрисованных элементов по id (для визуального перемещения больших выделений) */
  nodesOf: (ids: Iterable<string>) => Konva.Node[];
  /** Попадает ли экранная точка в ручки Transformer — тогда событие обрабатывает Konva */
  hitsTransformer: (screen: Point) => boolean;
  openImagePicker: (at: Point) => void;
  nextZIndex: () => string;
  /** Лазерная указка (слой курсоров) */
  laser: () => LaserRenderer | null;
  /** Ошибка фонового действия (голос не принят и т.п.) — показать пользователю */
  onError?: (error: unknown) => void;
}

interface Session {
  move(world: Point, e: PointerEvent): void;
  end(world: Point, e: PointerEvent): void;
  cancel(): void;
}

const zoom = () => useCanvasStore.getState().camera.zoom;
const state = () => useCanvasStore.getState();

/** После создания объекта инструмент возвращается к «выделению», если не закреплён */
function finishTool(): void {
  if (!state().toolLocked) state().setTool('select');
}

type Binding = NonNullable<LineElement['startBinding']>;

/** Объект под точкой, к которому можно привязать конец линии (кроме exclude) */
function bindTargetAt(store: ElementStore, world: Point, exclude?: string): BoardElement | null {
  const tolerance = HIT_TOLERANCE_PX / zoom();
  const candidates = store
    .query(pointQuery(world, tolerance))
    .filter((el) => el.id !== exclude && isBindable(el) && !el.locked);
  return topmostAt(candidates, world, tolerance);
}

function bindingAt(
  store: ElementStore,
  world: Point,
  exclude?: string,
): { binding: Binding; target: BoardElement } | null {
  const target = bindTargetAt(store, world, exclude);
  if (!target) return null;
  return {
    target,
    binding: { elementId: target.id, anchor: anchorAt(target, world, SIDE_SNAP_PX / zoom()) },
  };
}

/** Мировые точки линии (для превью в оверлее) */
function worldPoints(g: { x: number; y: number; points: readonly number[] }): number[] {
  const pts: number[] = [];
  for (let i = 0; i + 1 < g.points.length; i += 2) {
    pts.push(g.x + (g.points[i] ?? 0), g.y + (g.points[i + 1] ?? 0));
  }
  return pts;
}

/** Выделена ровно одна линия/стрелка без блокировки — у неё ручки концов */
export function selectedLine(store: ElementStore): LineElement | null {
  const selection = state().selection;
  if (selection.length !== 1) return null;
  const el = store.get(selection[0] ?? '');
  return el && (el.type === 'line' || el.type === 'arrow') && !el.locked
    ? (el as LineElement)
    : null;
}

/**
 * Обработка указателя на холсте. Не зависит от React: хук только
 * пробрасывает DOM-события. Каждое действие — сессия (move/end/cancel),
 * чтобы Escape корректно отменял любое начатое взаимодействие.
 */
export class InteractionController {
  private session: Session | null = null;

  constructor(private readonly deps: ControllerDeps) {}

  get active(): boolean {
    return this.session !== null;
  }

  pointerDown(e: PointerEvent, world: Point, screen: Point): boolean {
    if (e.button !== 0) return false;
    // Клик по холсту завершает правку ячейки таблицы (холст не забирает фокус сам)
    if (state().editingCell && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const { tool, toolOptions } = state();
    const actions = this.deps.actions();
    const user = this.deps.user();
    // Клик по холсту закрывает открытое обсуждение
    const comments = useCommentsStore.getState();
    if (tool !== 'comment' && (comments.openThreadId || comments.draft)) comments.openThread(null);

    switch (tool) {
      case 'select':
        return this.startSelect(e, world, screen);
      case 'sticky':
      case 'text': {
        if (!actions?.canEdit || !user) return false;
        const p = snapPointToGrid(world.x, world.y, state().snapToGrid ? CANVAS.gridSize : null);
        const el =
          tool === 'sticky'
            ? buildSticky({
                x: p.x - STICKY_SIZE / 2,
                y: p.y - STICKY_SIZE / 2,
                userId: user.id,
                zIndex: this.deps.nextZIndex(),
                fill: toolOptions.stickyColor,
                authorName: user.name,
              })
            : buildText({
                x: p.x,
                y: p.y - 12,
                userId: user.id,
                zIndex: this.deps.nextZIndex(),
                color: toolOptions.strokeColor,
              });
        actions.create([el]);
        finishTool();
        state().select([el.id]);
        state().setEditing(el.id);
        return true;
      }
      case 'table': {
        if (!actions?.canEdit || !user) return false;
        const p = snapPointToGrid(world.x, world.y, state().snapToGrid ? CANVAS.gridSize : null);
        const draft = buildTable({ x: 0, y: 0, userId: user.id, zIndex: this.deps.nextZIndex() });
        const table = { ...draft, x: p.x - draft.width / 2, y: p.y - draft.height / 2 };
        actions.create([table]);
        finishTool();
        state().select([table.id]);
        state().setEditingCell({ id: table.id, row: 0, col: 0 });
        return true;
      }
      case 'shape':
      case 'frame':
      case 'line':
      case 'arrow':
        if (!actions?.canEdit) return false;
        this.session = new CreateSession(this.deps, tool, world, e.shiftKey);
        return true;
      case 'pen':
        if (!actions?.canEdit) return false;
        this.session = new PenSession(this.deps, world);
        return true;
      case 'eraser':
        if (!actions?.canEdit) return false;
        this.session = new EraserSession(this.deps, world);
        return true;
      case 'image':
        this.deps.openImagePicker(world);
        return true;
      case 'laser': {
        const laser = this.deps.laser();
        if (!laser) return false;
        laser.add(world.x, world.y);
        this.session = {
          move: (p) => laser.add(p.x, p.y),
          end: () => laser.end(),
          cancel: () => laser.end(),
        };
        return true;
      }
      case 'vote': {
        const { voting, boardId } = useVotingStore.getState();
        if (!voting || voting.status !== 'active' || !voting.canVote || !boardId) return false;
        const tolerance = HIT_TOLERANCE_PX / zoom();
        const hit = topmostAt(
          this.deps.store.query(pointQuery(world, tolerance)),
          world,
          tolerance,
        );
        // Голосуют за содержательные объекты: стикеры, фигуры, текст, картинки
        if (!hit || !VOTABLE.has(hit.type)) return true;
        void castVote(boardId, voting.id, hit.id).catch((e: unknown) => this.deps.onError?.(e));
        return true;
      }
      case 'comment': {
        if (!actions?.canComment) return false;
        // Комментарий к объекту под курсором (пин поедет за ним) или к точке холста
        const tolerance = HIT_TOLERANCE_PX / zoom();
        const hit = topmostAt(
          this.deps.store.query(pointQuery(world, tolerance)),
          world,
          tolerance,
        );
        useCommentsStore.getState().startDraft({ x: world.x, y: world.y, elementId: hit?.id });
        finishTool();
        return true;
      }
      default:
        return false;
    }
  }

  private startSelect(e: PointerEvent, world: Point, screen: Point): boolean {
    const actions = this.deps.actions();
    // Ручка конца выделенной линии — перетаскивание конца (перепривязка)
    const line = actions?.canEdit ? selectedLine(this.deps.store) : null;
    if (line) {
      const ends = lineEnds(line);
      const r = HANDLE_PX / zoom();
      for (const which of ['start', 'end'] as const) {
        const p = ends[which];
        if (Math.hypot(p.x - world.x, p.y - world.y) <= r) {
          this.session = new EndpointSession(this.deps, line, which);
          return true;
        }
      }
    }
    if (this.deps.hitsTransformer(screen)) return false;
    const tolerance = HIT_TOLERANCE_PX / zoom();
    const hit = topmostAt(this.deps.store.query(pointQuery(world, tolerance)), world, tolerance);
    const selection = state().selection;

    if (!hit) {
      if (!e.shiftKey) state().select([]);
      this.session = new MarqueeSession(this.deps, world, e.shiftKey ? selection : []);
      return true;
    }

    const groupIds = actions?.expandGroups([hit.id]) ?? [hit.id];
    if (e.shiftKey) {
      const set = new Set(selection);
      const allSelected = groupIds.every((id) => set.has(id));
      for (const id of groupIds) {
        if (allSelected) set.delete(id);
        else set.add(id);
      }
      state().select(Array.from(set));
      return true;
    }
    if (!selection.includes(hit.id)) state().select(groupIds);

    // Фрейм перемещается вместе с содержимым
    const origins = actions?.movable(actions.withFrameChildren(state().selection)) ?? new Map();
    if (origins.size > 0) this.session = new MoveSession(this.deps, origins, world);
    return true;
  }

  /**
   * Нативный dblclick (а не два pointerdown подряд): браузер засчитывает его
   * только для двух завершённых кликов, поэтому клик + быстрый захват ручки
   * Transformer не превращается в «двойной клик».
   * Внутрь группы → один элемент; по стикеру/фигуре/тексту → редактирование.
   */
  doubleClick(world: Point): void {
    if (state().tool !== 'select') return;
    const actions = this.deps.actions();
    const tolerance = HIT_TOLERANCE_PX / zoom();
    const hit = topmostAt(this.deps.store.query(pointQuery(world, tolerance)), world, tolerance);
    if (!hit) return;
    const selection = state().selection;
    if (hit.groupId && selection.length > 1) {
      state().select([hit.id]);
    } else if (hit.type === 'table' && actions?.canEdit && !hit.locked) {
      // Двойной клик по таблице — редактирование ячейки под курсором
      const cell = cellAt(hit, world);
      state().select([hit.id]);
      if (cell) state().setEditingCell({ id: hit.id, ...cell });
    } else if (EDITABLE.has(hit.type) && actions?.canEdit && !hit.locked) {
      state().select([hit.id]);
      state().setEditing(hit.id);
    }
  }

  pointerMove(e: PointerEvent, world: Point): void {
    this.session?.move(world, e);
  }

  pointerUp(e: PointerEvent, world: Point): void {
    const s = this.session;
    this.session = null;
    s?.end(world, e);
  }

  cancel(): void {
    const s = this.session;
    this.session = null;
    s?.cancel();
  }
}

// ───────────────────────────── Перемещение ─────────────────────────────

class MoveSession implements Session {
  private started = false;
  private readonly live: boolean;
  private readonly startBounds: Bounds | null;
  private readonly snapTargets: Bounds[];
  private readonly nodes: Array<{ node: Konva.Node; x: number; y: number }> = [];
  private dx = 0;
  private dy = 0;

  constructor(
    private readonly deps: ControllerDeps,
    private readonly origins: Map<string, { x: number; y: number }>,
    private readonly start: Point,
  ) {
    this.live = origins.size <= LIVE_MOVE_LIMIT;
    this.startBounds = deps.store.boundsOfIds(origins.keys());
    // Цели привязки — видимые объекты вне выделения (фиксируем на старте)
    const { camera, size } = state();
    this.snapTargets = [];
    for (const el of deps.store.query(visibleBounds(camera, size))) {
      if (this.snapTargets.length >= 500) break;
      if (!origins.has(el.id)) {
        const b = deps.store.boundsOf(el.id);
        if (b) this.snapTargets.push(b);
      }
    }
  }

  move(world: Point, e: PointerEvent): void {
    let dx = world.x - this.start.x;
    let dy = world.y - this.start.y;
    if (!this.started) {
      if (Math.hypot(dx, dy) * zoom() < DRAG_THRESHOLD_PX) return;
      this.started = true;
      this.deps.actions()?.beginGesture();
      if (!this.live) {
        for (const node of this.deps.nodesOf(this.origins.keys()))
          this.nodes.push({ node, x: node.x(), y: node.y() });
      }
    }

    // Alt — временно без привязки
    if (this.startBounds && !e.altKey) {
      const { snapToGrid, snapToObjects } = state();
      const snap = computeSnap(translateBounds(this.startBounds, dx, dy), this.snapTargets, {
        threshold: SNAP_PX / zoom(),
        toObjects: snapToObjects,
        gridSize: snapToGrid ? CANVAS.gridSize : null,
      });
      dx += snap.dx;
      dy += snap.dy;
      this.deps.overlay.setGuides(snap.guides);
    } else {
      this.deps.overlay.setGuides([]);
    }
    this.dx = dx;
    this.dy = dy;

    if (this.live) {
      // Пишем в Yjs сразу: коллеги видят перетаскивание вживую, а UndoManager
      // (captureTimeout 500 мс) сольёт все промежуточные шаги в один шаг отмены
      this.deps.actions()?.moveFrom(this.origins, dx, dy, true);
    } else {
      for (const n of this.nodes) n.node.position({ x: n.x + dx, y: n.y + dy });
      this.nodes[0]?.node.getLayer()?.batchDraw();
      if (this.startBounds)
        this.deps.overlay.setSelectionBox(translateBounds(this.startBounds, dx, dy));
    }
  }

  end(): void {
    this.deps.overlay.setGuides([]);
    if (!this.started) return;
    const actions = this.deps.actions();
    actions?.moveFrom(this.origins, this.dx, this.dy, true);
    // Перенесённая линия отрывается от объектов, которые остались на месте
    actions?.detachMoved(this.origins.keys());
    // Объект, перенесённый центром во фрейм (или из него), меняет родителя — тем же шагом отмены
    actions?.reparent(this.origins.keys());
  }

  cancel(): void {
    this.deps.overlay.setGuides([]);
    if (!this.started) return;
    if (this.live) {
      this.deps.actions()?.moveFrom(this.origins, 0, 0, true);
    } else {
      for (const n of this.nodes) n.node.position({ x: n.x, y: n.y });
      this.nodes[0]?.node.getLayer()?.batchDraw();
    }
  }
}

// ───────────────────────────── Рамка выделения ─────────────────────────────

class MarqueeSession implements Session {
  constructor(
    private readonly deps: ControllerDeps,
    private readonly start: Point,
    private readonly base: readonly string[],
  ) {}

  move(world: Point): void {
    const rect = rectFromPoints(this.start, world);
    this.deps.overlay.setMarquee(rect);
    // Фрейм попадает в рамку, только если охвачен целиком: иначе рамка внутри фрейма выделяла бы и его
    const hits = elementsInRect(this.deps.store.query(rect), rect)
      .filter(
        (el) =>
          el.type !== 'frame' ||
          (el.x >= rect.minX &&
            el.y >= rect.minY &&
            el.x + el.width <= rect.maxX &&
            el.y + el.height <= rect.maxY),
      )
      .map((el) => el.id);
    const expanded = this.deps.actions()?.expandGroups(hits) ?? hits;
    state().select(Array.from(new Set([...this.base, ...expanded])));
  }

  end(): void {
    this.deps.overlay.setMarquee(null);
  }

  cancel(): void {
    this.deps.overlay.setMarquee(null);
    state().select(this.base);
  }
}

// ───────────────────────────── Создание фигур и линий ─────────────────────────────

class CreateSession implements Session {
  private current: Point;

  constructor(
    private readonly deps: ControllerDeps,
    private readonly kind: 'shape' | 'frame' | 'line' | 'arrow',
    start: Point,
    private shift: boolean,
  ) {
    this.start = snapPointToGrid(start.x, start.y, state().snapToGrid ? CANVAS.gridSize : null);
    this.current = this.start;
    if (kind === 'line' || kind === 'arrow') {
      this.startBinding = bindingAt(deps.store, start)?.binding ?? null;
    }
  }

  /** Временная линия для превью: та же геометрия, что получится после создания */
  private draft(): LineElement {
    return buildLine({
      type: this.kind === 'arrow' ? 'arrow' : 'line',
      x: this.start.x,
      y: this.start.y,
      dx: this.current.x - this.start.x,
      dy: this.current.y - this.start.y,
      stroke: state().toolOptions.strokeColor,
      strokeWidth: 3,
      userId: '',
      zIndex: 'a0',
      routing: state().toolOptions.lineRouting,
      startBinding: this.startBinding ?? undefined,
      endBinding: this.endBinding ?? undefined,
    });
  }

  private readonly start: Point;
  /** Линия начата на объекте — её начало привязано к нему */
  private startBinding: Binding | null = null;
  private endBinding: Binding | null = null;

  /** Shift: квадрат / окружность, для линий — шаг 45° */
  private constrained(world: Point): Point {
    const dx = world.x - this.start.x;
    const dy = world.y - this.start.y;
    if (!this.shift) return world;
    if (this.kind === 'shape' || this.kind === 'frame') {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      return {
        x: this.start.x + Math.sign(dx || 1) * side,
        y: this.start.y + Math.sign(dy || 1) * side,
      };
    }
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: this.start.x + Math.cos(angle) * len, y: this.start.y + Math.sin(angle) * len };
  }

  move(world: Point, e: PointerEvent): void {
    this.shift = e.shiftKey;
    const g = state().snapToGrid ? CANVAS.gridSize : null;
    const snapped = snapPointToGrid(world.x, world.y, g);
    this.current = this.constrained(snapped);
    if (this.kind === 'shape' || this.kind === 'frame') {
      this.deps.overlay.setShapePreview(rectFromPoints(this.start, this.current));
    } else {
      const hit = bindingAt(this.deps.store, world, this.startBinding?.elementId);
      this.endBinding = hit?.binding ?? null;
      this.deps.overlay.setBindTarget(hit ? this.deps.store.boundsOf(hit.target.id) : null);
      const draft = this.draft();
      const g = routeLine(draft, (id) => this.deps.store.get(id)) ?? draft;
      this.deps.overlay.setStroke(worldPoints(g), {
        color: state().toolOptions.strokeColor,
        width: 3,
      });
    }
  }

  end(): void {
    this.deps.overlay.setShapePreview(null);
    this.deps.overlay.setStroke(null);
    this.deps.overlay.setBindTarget(null);
    const actions = this.deps.actions();
    const user = this.deps.user();
    if (!actions || !user) return;
    const { toolOptions } = state();
    const tiny =
      Math.hypot(this.current.x - this.start.x, this.current.y - this.start.y) * zoom() < 4;

    let el: BoardElement;
    if (this.kind === 'frame') {
      // Клик без протягивания — фрейм 16:9 по центру точки клика
      const rect = tiny
        ? {
            minX: this.start.x - 400,
            minY: this.start.y - 225,
            maxX: this.start.x + 400,
            maxY: this.start.y + 225,
          }
        : rectFromPoints(this.start, this.current);
      const frame = buildFrame({
        x: rect.minX,
        y: rect.minY,
        width: Math.max(40, rect.maxX - rect.minX),
        height: Math.max(40, rect.maxY - rect.minY),
        title: nextFrameTitle(this.deps.store.frames()),
        userId: user.id,
        zIndex: this.deps.nextZIndex(),
      });
      actions.create([frame]);
      // Объекты, уже лежащие в области нового фрейма, становятся его содержимым
      actions.reparentIn(rect);
      finishTool();
      state().select([frame.id]);
      return;
    }
    if (this.kind === 'shape') {
      const rect = tiny
        ? {
            minX: this.start.x - 80,
            minY: this.start.y - 60,
            maxX: this.start.x + 80,
            maxY: this.start.y + 60,
          }
        : rectFromPoints(this.start, this.current);
      el = buildShape({
        x: rect.minX,
        y: rect.minY,
        width: Math.max(8, rect.maxX - rect.minX),
        height: Math.max(8, rect.maxY - rect.minY),
        shape: toolOptions.shapeKind,
        fill: toolOptions.shapeFill,
        stroke: toolOptions.strokeColor,
        userId: user.id,
        zIndex: this.deps.nextZIndex(),
      });
    } else {
      const dx = tiny ? 200 : this.current.x - this.start.x;
      const dy = tiny ? 0 : this.current.y - this.start.y;
      el = buildLine({
        type: this.kind,
        x: this.start.x,
        y: this.start.y,
        dx,
        dy,
        stroke: toolOptions.strokeColor,
        strokeWidth: 3,
        userId: user.id,
        zIndex: this.deps.nextZIndex(),
        routing: toolOptions.lineRouting,
        startBinding: this.startBinding ?? undefined,
        // Клик без протягивания — линия вправо, второй конец свободный
        endBinding: tiny ? undefined : (this.endBinding ?? undefined),
      });
    }
    actions.create([el]);
    finishTool();
    state().select([el.id]);
  }

  cancel(): void {
    this.deps.overlay.setShapePreview(null);
    this.deps.overlay.setStroke(null);
    this.deps.overlay.setBindTarget(null);
  }
}

// ───────────────────────────── Конец линии ─────────────────────────────

/**
 * Перетаскивание ручки конца выделенной линии: над объектом конец
 * привязывается к нему (у середины стороны — к стороне), в пустоте —
 * становится свободным. Записывается одной правкой в конце жеста.
 */
class EndpointSession implements Session {
  private binding: Binding | null = null;
  private current: Point;

  constructor(
    private readonly deps: ControllerDeps,
    private readonly line: LineElement,
    private readonly which: 'start' | 'end',
  ) {
    this.current = lineEnds(line)[which];
  }

  private key(): 'startBinding' | 'endBinding' {
    return this.which === 'start' ? 'startBinding' : 'endBinding';
  }

  private geometry() {
    const draft: LineElement = { ...this.line, [this.key()]: this.binding ?? undefined };
    const override = this.binding ? undefined : { [this.which]: this.current };
    return routeLine(draft, (id) => this.deps.store.get(id), override);
  }

  move(world: Point): void {
    this.current = world;
    const other = this.which === 'start' ? this.line.endBinding : this.line.startBinding;
    const hit = bindingAt(this.deps.store, world, other?.elementId);
    this.binding = hit?.binding ?? null;
    this.deps.overlay.setBindTarget(hit ? this.deps.store.boundsOf(hit.target.id) : null);
    const g = this.geometry();
    if (g) this.deps.overlay.setStroke(worldPoints(g), { color: '#6366f1', width: 2 / zoom() });
  }

  end(): void {
    this.deps.overlay.setBindTarget(null);
    this.deps.overlay.setStroke(null);
    const actions = this.deps.actions();
    const g = this.geometry();
    if (!actions || !g) return;
    actions.update(new Map([[this.line.id, { ...g, [this.key()]: this.binding ?? undefined }]]));
  }

  cancel(): void {
    this.deps.overlay.setBindTarget(null);
    this.deps.overlay.setStroke(null);
  }
}

// ───────────────────────────── Карандаш ─────────────────────────────

class PenSession implements Session {
  private readonly points: number[];

  constructor(
    private readonly deps: ControllerDeps,
    start: Point,
  ) {
    this.points = [start.x, start.y];
  }

  private style() {
    const { penColor, penWidth, penMode } = state().toolOptions;
    const width = penMode === 'highlighter' ? penWidth * 4 : penWidth;
    return { color: penColor, width, opacity: penMode === 'highlighter' ? 0.35 : 1 };
  }

  move(world: Point, e: PointerEvent): void {
    // Склеенные события (coalesced): на быстрых движениях — все промежуточные точки
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const last = {
      x: this.points[this.points.length - 2] ?? 0,
      y: this.points[this.points.length - 1] ?? 0,
    };
    const minStep = 0.5 / zoom();
    if (Math.hypot(world.x - last.x, world.y - last.y) < minStep) return;
    if (events.length > 1) {
      // Координаты coalesced-событий переводим тем же смещением, что и основное событие
      const offX = world.x - e.clientX / zoom();
      const offY = world.y - e.clientY / zoom();
      for (const ce of events.slice(0, -1))
        this.points.push(ce.clientX / zoom() + offX, ce.clientY / zoom() + offY);
    }
    this.points.push(world.x, world.y);
    this.deps.overlay.setStroke(this.points, this.style());
  }

  end(): void {
    this.deps.overlay.setStroke(null);
    const actions = this.deps.actions();
    const user = this.deps.user();
    if (!actions || !user) return;
    let pts = simplifyPoints(this.points, 0.75 / zoom());
    // Клик без движения — точка
    if (pts.length < 4)
      pts = [
        this.points[0] ?? 0,
        this.points[1] ?? 0,
        (this.points[0] ?? 0) + 0.5,
        this.points[1] ?? 0,
      ];
    const { penMode } = state().toolOptions;
    const style = this.style();
    actions.create([
      buildPath({
        absolutePoints: pts,
        stroke: style.color,
        strokeWidth: style.width,
        tool: penMode,
        userId: user.id,
        zIndex: this.deps.nextZIndex(),
      }),
    ]);
  }

  cancel(): void {
    this.deps.overlay.setStroke(null);
  }
}

// ───────────────────────────── Ластик ─────────────────────────────

class EraserSession implements Session {
  private readonly hits = new Set<string>();
  private readonly faded: Konva.Node[] = [];

  constructor(
    private readonly deps: ControllerDeps,
    start: Point,
  ) {
    this.collect(start);
  }

  /** Ластик стирает росчерки карандаша целиком (как в большинстве досок) */
  private collect(world: Point): void {
    const r = ERASER_RADIUS_PX / zoom();
    for (const el of this.deps.store.query(pointQuery(world, r))) {
      if (el.type !== 'path' || this.hits.has(el.id) || el.locked) continue;
      if (hitElement(el, world, r)) {
        this.hits.add(el.id);
        for (const node of this.deps.nodesOf([el.id])) {
          node.opacity(0.25);
          this.faded.push(node);
        }
      }
    }
    this.faded[0]?.getLayer()?.batchDraw();
  }

  move(world: Point): void {
    this.collect(world);
  }

  end(): void {
    if (this.hits.size === 0) return;
    // Одна транзакция на весь жест — один шаг undo
    this.deps.actions()?.delete(this.hits);
  }

  cancel(): void {
    for (const node of this.faded) node.opacity(1);
    this.faded[0]?.getLayer()?.batchDraw();
  }
}
