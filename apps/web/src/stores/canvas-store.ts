import { create } from 'zustand';
import type { LineRouting, ShapeElement } from '@prostor/shared';
import { DEFAULT_CAMERA, type Camera, type Size } from '@/lib/canvas/viewport';

export type CanvasTool =
  | 'select'
  | 'hand'
  | 'sticky'
  | 'shape'
  | 'text'
  | 'line'
  | 'arrow'
  | 'pen'
  | 'eraser'
  | 'image'
  | 'frame'
  | 'comment'
  | 'laser'
  /** Режим голосования: клик по объекту отдаёт голос */
  | 'vote';

/** Инструменты, создающие объекты, — недоступны читателям */
export const CREATION_TOOLS: ReadonlySet<CanvasTool> = new Set([
  'sticky',
  'shape',
  'text',
  'line',
  'arrow',
  'pen',
  'eraser',
  'image',
  'frame',
]);

export const STICKY_COLORS = [
  '#fde68a',
  '#bbf7d0',
  '#bfdbfe',
  '#fbcfe8',
  '#ddd6fe',
  '#fed7aa',
  '#e5e7eb',
] as const;
export const STROKE_COLORS = [
  '#1f2937',
  '#e5484d',
  '#f76b15',
  '#30a46c',
  '#0091ff',
  '#8e4ec6',
  '#ffffff',
] as const;
export const FILL_COLORS = [
  '#ffffff',
  '#fde68a',
  '#bbf7d0',
  '#bfdbfe',
  '#fbcfe8',
  '#ddd6fe',
  'transparent',
] as const;

export interface ToolOptions {
  stickyColor: string;
  shapeKind: ShapeElement['shape'];
  shapeFill: string;
  strokeColor: string;
  penColor: string;
  penWidth: number;
  penMode: 'pen' | 'marker' | 'highlighter';
  /** Маршрут новых линий и стрелок */
  lineRouting: LineRouting;
}

export type BoardPanel = 'export' | 'history' | 'comments';

/** За кем следуем (follow-mode); auto — включилось само, потому что он «позвал всех» */
export interface FollowTarget {
  userId: string;
  name: string;
  color: string;
  auto: boolean;
}

interface CanvasState {
  camera: Camera;
  /** Размер области холста в CSS-пикселях */
  size: Size;
  tool: CanvasTool;
  /** Не возвращаться к «выделению» после создания объекта (двойной клик по инструменту) */
  toolLocked: boolean;
  toolOptions: ToolOptions;
  snapToGrid: boolean;
  snapToObjects: boolean;
  /** Зажат Space — временный режим «рука» */
  spacePressed: boolean;
  /** Идёт панорамирование (курсор «grabbing», отключение hover-эффектов) */
  isPanning: boolean;
  /** Выделенные элементы (локально; коллегам уходит через awareness) */
  selection: readonly string[];
  /** Элемент, текст которого редактируется в inline-редакторе */
  editingId: string | null;
  /** Режим презентации: номер текущего слайда (фрейма) и показ заметок; null — выключен */
  presentation: { index: number; notes: boolean } | null;
  /** Открытая панель доски (экспорт, история версий) — кнопки в шапке живут вне холста */
  panel: BoardPanel | null;
  follow: FollowTarget | null;

  setCamera: (camera: Camera | ((prev: Camera) => Camera)) => void;
  setSize: (size: Size) => void;
  setTool: (tool: CanvasTool, locked?: boolean) => void;
  setToolOptions: (patch: Partial<ToolOptions>) => void;
  setSnap: (patch: { snapToGrid?: boolean; snapToObjects?: boolean }) => void;
  setSpacePressed: (pressed: boolean) => void;
  setPanning: (panning: boolean) => void;
  select: (ids: readonly string[]) => void;
  setEditing: (id: string | null) => void;
  setPresentation: (presentation: { index: number; notes: boolean } | null) => void;
  setPanel: (panel: BoardPanel | null) => void;
  setFollow: (follow: FollowTarget | null) => void;
  reset: () => void;
}

const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  stickyColor: STICKY_COLORS[0],
  shapeKind: 'rect',
  shapeFill: '#ffffff',
  strokeColor: '#1f2937',
  penColor: '#1f2937',
  penWidth: 4,
  penMode: 'pen',
  lineRouting: 'straight',
};

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Локальное UI-состояние холста (Zustand). Данные доски здесь не хранятся —
 * они живут в Yjs. Камера, инструмент и выделение у каждого пользователя свои.
 *
 * Компоненты подписываются селекторами (useCanvasStore((s) => s.tool)),
 * поэтому движение камеры не перерисовывает тулбар, а смена инструмента — холст.
 */
export const useCanvasStore = create<CanvasState>()((set) => ({
  camera: DEFAULT_CAMERA,
  size: { width: 0, height: 0 },
  tool: 'select',
  toolLocked: false,
  toolOptions: DEFAULT_TOOL_OPTIONS,
  snapToGrid: false,
  snapToObjects: true,
  spacePressed: false,
  isPanning: false,
  selection: [],
  editingId: null,
  presentation: null,
  panel: null,
  follow: null,

  setCamera: (camera) =>
    set((state) => ({ camera: typeof camera === 'function' ? camera(state.camera) : camera })),
  setSize: (size) =>
    set((state) =>
      state.size.width === size.width && state.size.height === size.height ? state : { size },
    ),
  setTool: (tool, locked = false) =>
    set((state) => ({
      tool,
      toolLocked: locked,
      editingId: null,
      // Переключение на инструмент создания снимает выделение
      selection: tool === 'select' || tool === 'hand' ? state.selection : [],
    })),
  setToolOptions: (patch) => set((state) => ({ toolOptions: { ...state.toolOptions, ...patch } })),
  setSnap: (patch) => set(patch),
  setSpacePressed: (spacePressed) => set({ spacePressed }),
  setPanning: (isPanning) => set({ isPanning }),
  select: (ids) =>
    set((state) => (sameIds(state.selection, ids) ? state : { selection: ids, editingId: null })),
  setEditing: (editingId) => set({ editingId }),
  setPresentation: (presentation) => set({ presentation }),
  setPanel: (panel) => set({ panel }),
  setFollow: (follow) => set({ follow }),
  reset: () =>
    set({
      camera: DEFAULT_CAMERA,
      tool: 'select',
      toolLocked: false,
      spacePressed: false,
      isPanning: false,
      selection: [],
      editingId: null,
      panel: null,
      follow: null,
    }),
}));
