import type { BoardElement, LineElement, ShapeElement } from '@prostor/shared';
import {
  buildFrame,
  buildLine,
  buildPath,
  buildShape,
  buildText,
} from '@/lib/canvas/element-factory';
import {
  cornerForCenterRotation,
  lineGeometry,
  safeColor,
  type ImportContext,
  type ImportResult,
} from '@/lib/import/common';

/**
 * Импорт из Excalidraw (.excalidraw / JSON из «Сохранить в файл»):
 * прямоугольники, эллипсы, ромбы, текст (в том числе подписи внутри фигур),
 * стрелки и линии с привязками, рисунки от руки, фреймы.
 * Вставленные картинки пропускаются — их файлы Excalidraw хранит отдельно.
 */
interface ExEl {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  opacity?: number;
  roundness?: unknown;
  isDeleted?: boolean;
  text?: string;
  fontSize?: number;
  textAlign?: string;
  containerId?: string | null;
  points?: Array<[number, number]>;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  name?: string | null;
}

export function isExcalidraw(json: unknown): boolean {
  return (
    typeof json === 'object' &&
    json !== null &&
    Array.isArray((json as { elements?: unknown }).elements) &&
    ((json as { type?: unknown }).type === 'excalidraw' ||
      (json as { type?: unknown }).type === 'excalidraw/clipboard')
  );
}

const SHAPES: Record<string, ShapeElement['shape']> = {
  rectangle: 'rect',
  ellipse: 'ellipse',
  diamond: 'diamond',
};

export function importExcalidraw(json: unknown, ctx: ImportContext): ImportResult {
  const all = ((json as { elements: ExEl[] }).elements ?? []).filter(
    (e) => e && !e.isDeleted && typeof e.x === 'number' && typeof e.y === 'number',
  );
  const ids = new Map<string, string>();
  const out: BoardElement[] = [];
  let skipped = 0;
  // Подписи внутри фигур (containerId) становятся текстом самой фигуры
  const labels = new Map<string, ExEl>();
  for (const e of all) if (e.type === 'text' && e.containerId) labels.set(e.containerId, e);

  for (const e of all) {
    const rotation = ((e.angle ?? 0) * 180) / Math.PI;
    const corner = cornerForCenterRotation(e.x, e.y, e.width, e.height, e.angle ?? 0);
    const opacity = Math.max(0, Math.min(1, (e.opacity ?? 100) / 100));
    const stroke = safeColor(e.strokeColor, '#1f2937');
    const fill = safeColor(e.backgroundColor, 'transparent');
    const common = { rotation, opacity };

    if (SHAPES[e.type] || (e.type === 'rectangle' && e.roundness)) {
      const kind = e.type === 'rectangle' && e.roundness ? 'roundRect' : SHAPES[e.type]!;
      const label = labels.get(e.id);
      const el = buildShape({
        ...corner,
        width: Math.max(8, e.width),
        height: Math.max(8, e.height),
        shape: kind,
        fill,
        stroke,
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      const shape: ShapeElement = {
        ...el,
        ...common,
        strokeWidth: Math.max(0, e.strokeWidth ?? 2),
        text: label?.text ?? '',
        fontSize: label?.fontSize ?? el.fontSize,
        textColor: label ? safeColor(label.strokeColor, '#1f2937') : el.textColor,
      };
      ids.set(e.id, shape.id);
      out.push(shape);
      continue;
    }
    if (e.type === 'text') {
      if (
        e.containerId &&
        labels.get(e.containerId) === e &&
        all.some((c) => c.id === e.containerId)
      )
        continue;
      const el = buildText({
        ...corner,
        text: e.text ?? '',
        fontSize: e.fontSize ?? 20,
        color: stroke,
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      const align = e.textAlign === 'center' || e.textAlign === 'right' ? e.textAlign : 'left';
      out.push({
        ...el,
        ...common,
        width: Math.max(20, e.width + 4),
        height: Math.max(el.height, e.height),
        align,
      });
      ids.set(e.id, el.id);
      continue;
    }
    if (
      (e.type === 'arrow' || e.type === 'line') &&
      Array.isArray(e.points) &&
      e.points.length >= 2
    ) {
      const base = buildLine({
        x: e.x,
        y: e.y,
        type: e.type === 'arrow' ? 'arrow' : 'line',
        dx: 0,
        dy: 0,
        stroke,
        strokeWidth: Math.max(1, e.strokeWidth ?? 2),
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      const line: LineElement = {
        ...base,
        opacity,
        ...lineGeometry(e.points),
        startArrow: e.startArrowhead ? (e.startArrowhead === 'dot' ? 'dot' : 'arrow') : 'none',
        endArrow:
          e.type === 'arrow' && e.endArrowhead !== null
            ? e.endArrowhead === 'dot'
              ? 'dot'
              : 'arrow'
            : 'none',
      };
      // Привязки — после того как все фигуры получат новые id (ниже)
      (line as LineElement & { _start?: string; _end?: string })._start = e.startBinding?.elementId;
      (line as LineElement & { _start?: string; _end?: string })._end = e.endBinding?.elementId;
      out.push(line);
      continue;
    }
    if (e.type === 'freedraw' && Array.isArray(e.points) && e.points.length >= 2) {
      const abs: number[] = [];
      for (const [px, py] of e.points) abs.push(e.x + px, e.y + py);
      const path = buildPath({
        absolutePoints: abs,
        stroke,
        strokeWidth: Math.max(1, (e.strokeWidth ?? 2) * 1.5),
        tool: 'pen',
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      out.push({ ...path, opacity });
      continue;
    }
    if (e.type === 'frame' || e.type === 'magicframe') {
      const frame = buildFrame({
        x: e.x,
        y: e.y,
        width: Math.max(40, e.width),
        height: Math.max(40, e.height),
        title: e.name || 'Фрейм',
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      ids.set(e.id, frame.id);
      out.push(frame);
      continue;
    }
    skipped++;
  }

  // Стрелки, привязанные к фигурам, остаются привязанными
  const elements = out.map((el) => {
    const tagged = el as LineElement & { _start?: string; _end?: string };
    if (!('_start' in tagged) && !('_end' in tagged)) return el;
    const { _start, _end, ...line } = tagged;
    const start = _start ? ids.get(_start) : undefined;
    const end = _end ? ids.get(_end) : undefined;
    return {
      ...line,
      ...(start ? { startBinding: { elementId: start, anchor: 'auto' as const } } : {}),
      ...(end ? { endBinding: { elementId: end, anchor: 'auto' as const } } : {}),
    } as LineElement;
  });
  return { elements, skipped };
}
