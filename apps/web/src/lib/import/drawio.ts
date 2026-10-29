import type { BoardElement, LineElement, ShapeElement } from '@prostor/shared';
import { buildFrame, buildLine, buildShape, buildText } from '@/lib/canvas/element-factory';
import {
  lineGeometry,
  safeColor,
  type ImportContext,
  type ImportResult,
} from '@/lib/import/common';

/**
 * Импорт из draw.io / diagrams.net (.drawio, .xml): фигуры (прямоугольники,
 * эллипсы, ромбы, цилиндры, документы, облака…), текст, контейнеры-«дорожки»
 * как фреймы и связи со стрелками, привязанные к фигурам. Сжатые диаграммы
 * (base64 + deflate) распаковываются в браузере.
 */

function parseStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  style.split(';').forEach((part, i) => {
    if (!part) return;
    const eq = part.indexOf('=');
    if (eq === -1) {
      // Первое слово без «=» — имя фигуры (ellipse, rhombus, text…)
      if (i === 0) out.shape = out.shape ?? part;
      out[part] = '1';
    } else out[part.slice(0, eq)] = part.slice(eq + 1);
  });
  return out;
}

/** HTML-подпись draw.io → обычный текст с переносами */
function plainLabel(value: string): string {
  if (!value) return '';
  const html = value.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n');
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

async function inflate(base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64.trim()), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const text = await new Response(stream).text();
  return decodeURIComponent(text);
}

/** Модель графа из файла: несжатая, сжатая или сразу mxGraphModel */
export async function drawioModel(xml: string): Promise<Document | null> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  if (doc.documentElement.nodeName === 'mxGraphModel') return doc;
  const diagram = doc.querySelector('diagram');
  if (!diagram) return null;
  const inline = diagram.querySelector('mxGraphModel');
  if (inline)
    return parser.parseFromString(new XMLSerializer().serializeToString(inline), 'application/xml');
  const packed = diagram.textContent ?? '';
  if (!packed.trim()) return null;
  const unpacked = await inflate(packed);
  return parser.parseFromString(unpacked, 'application/xml');
}

function shapeKind(s: Record<string, string>): ShapeElement['shape'] | null {
  const name = (s.shape ?? '').replace(/^mxgraph\.\w+\./, '');
  if (s.ellipse || name === 'ellipse' || name === 'doubleEllipse') return 'ellipse';
  if (s.rhombus || name === 'rhombus') return 'diamond';
  if (s.triangle || name === 'triangle') return 'triangle';
  if (name.startsWith('cylinder') || name === 'datastore') return 'cylinder';
  if (name === 'document') return 'document';
  if (name === 'parallelogram') return 'parallelogram';
  if (name === 'trapezoid' || name === 'manualInput') return 'trapezoid';
  if (name === 'hexagon') return 'hexagon';
  if (name === 'cloud') return 'cloud';
  if (name === 'callout') return 'callout';
  if (name === 'singleArrow' || name === 'flexArrow') return 'blockArrow';
  if (name === 'cross') return 'plus';
  if (name === 'star') return 'star';
  if (name === 'terminator' || (s.rounded === '1' && s.arcSize === '50')) return 'pill';
  if (s.rounded === '1') return 'roundRect';
  return 'rect';
}

export async function importDrawio(xml: string, ctx: ImportContext): Promise<ImportResult | null> {
  const model = await drawioModel(xml);
  if (!model) return null;
  const cells = [...model.querySelectorAll('mxCell')];
  const byId = new Map(cells.map((c) => [c.getAttribute('id') ?? '', c]));
  const geometryOf = (c: Element) => {
    const g = c.querySelector(':scope > mxGeometry');
    const num = (name: string) => Number(g?.getAttribute(name) ?? 0) || 0;
    return { x: num('x'), y: num('y'), w: num('width'), h: num('height'), el: g };
  };
  // Координаты в draw.io — относительно родителя-контейнера
  const offsetOf = (c: Element): { x: number; y: number } => {
    const parentId = c.getAttribute('parent');
    const parent = parentId ? byId.get(parentId) : undefined;
    if (!parent || parent.getAttribute('vertex') !== '1') return { x: 0, y: 0 };
    const g = geometryOf(parent);
    const o = offsetOf(parent);
    return { x: o.x + g.x, y: o.y + g.y };
  };

  const ids = new Map<string, BoardElement>();
  const out: BoardElement[] = [];
  let skipped = 0;

  for (const c of cells) {
    if (c.getAttribute('vertex') !== '1') continue;
    const style = parseStyle(c.getAttribute('style') ?? '');
    const g = geometryOf(c);
    const o = offsetOf(c);
    const x = o.x + g.x;
    const y = o.y + g.y;
    const label = plainLabel(c.getAttribute('value') ?? '');
    const stroke = safeColor(style.strokeColor, '#1f2937');
    const fill = safeColor(style.fillColor, '#ffffff');
    const fontSize = Number(style.fontSize) || 14;
    const textColor = safeColor(style.fontColor, '#1f2937');
    if (style.image || style.shape === 'image') {
      skipped++;
      continue;
    }
    if (style.swimlane || style.shape === 'swimlane' || style.container === '1') {
      const frame = buildFrame({
        x,
        y,
        width: Math.max(40, g.w),
        height: Math.max(40, g.h),
        title: label || 'Фрейм',
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      ids.set(c.getAttribute('id') ?? '', frame);
      out.push(frame);
      continue;
    }
    if (
      style.text ||
      style.shape === 'text' ||
      (fill === 'transparent' && style.strokeColor === 'none')
    ) {
      if (!label) continue;
      const text = buildText({
        x,
        y,
        text: label,
        fontSize,
        color: textColor,
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      const align: 'left' | 'center' | 'right' =
        style.align === 'center' || style.align === 'right' ? style.align : 'left';
      const el = { ...text, width: Math.max(20, g.w), height: Math.max(text.height, g.h), align };
      ids.set(c.getAttribute('id') ?? '', el);
      out.push(el);
      continue;
    }
    const kind = shapeKind(style);
    if (!kind) {
      skipped++;
      continue;
    }
    const shape = buildShape({
      x,
      y,
      width: Math.max(8, g.w),
      height: Math.max(8, g.h),
      shape: kind,
      fill: style.fillColor ? fill : '#ffffff',
      stroke: style.strokeColor === 'none' ? 'transparent' : stroke,
      userId: ctx.userId,
      zIndex: ctx.z(),
    });
    const el: ShapeElement = {
      ...shape,
      strokeWidth: style.strokeColor === 'none' ? 0 : Number(style.strokeWidth) || 1.5,
      text: label,
      fontSize,
      textColor,
      ...(style.rotation ? { rotation: Number(style.rotation) || 0 } : {}),
    };
    ids.set(c.getAttribute('id') ?? '', el);
    out.push(el);
  }

  for (const c of cells) {
    if (c.getAttribute('edge') !== '1') continue;
    const style = parseStyle(c.getAttribute('style') ?? '');
    const g = geometryOf(c);
    const o = offsetOf(c);
    const source = ids.get(c.getAttribute('source') ?? '');
    const target = ids.get(c.getAttribute('target') ?? '');
    const point = (as: string) => {
      const p = g.el?.querySelector(`:scope > mxPoint[as="${as}"]`);
      return p
        ? { x: o.x + Number(p.getAttribute('x') ?? 0), y: o.y + Number(p.getAttribute('y') ?? 0) }
        : null;
    };
    const center = (el: BoardElement | undefined) =>
      el ? { x: el.x + el.width / 2, y: el.y + el.height / 2 } : null;
    const start = center(source) ?? point('sourcePoint');
    const end = center(target) ?? point('targetPoint');
    if (!start || !end) {
      skipped++;
      continue;
    }
    const waypoints = [
      ...(g.el?.querySelectorAll(':scope > Array[as="points"] > mxPoint') ?? []),
    ].map(
      (p) =>
        [
          o.x + Number(p.getAttribute('x') ?? 0) - start.x,
          o.y + Number(p.getAttribute('y') ?? 0) - start.y,
        ] as [number, number],
    );
    const arrow = style.endArrow !== 'none';
    const base = buildLine({
      x: start.x,
      y: start.y,
      type: arrow ? 'arrow' : 'line',
      dx: end.x - start.x,
      dy: end.y - start.y,
      stroke: safeColor(style.strokeColor, '#475569'),
      strokeWidth: Number(style.strokeWidth) || 2,
      routing:
        style.edgeStyle?.includes('orthogonal') || style.edgeStyle?.includes('elbow')
          ? 'elbow'
          : 'straight',
      ...(source ? { startBinding: { elementId: source.id, anchor: 'auto' as const } } : {}),
      ...(target ? { endBinding: { elementId: target.id, anchor: 'auto' as const } } : {}),
      userId: ctx.userId,
      zIndex: ctx.z(),
    });
    const line: LineElement = {
      ...base,
      ...(waypoints.length > 0 && !source && !target
        ? lineGeometry([[0, 0], ...waypoints, [end.x - start.x, end.y - start.y]])
        : {}),
      ...(style.dashed === '1' ? { dash: [8, 6] } : {}),
      ...(style.startArrow && style.startArrow !== 'none' ? { startArrow: 'arrow' as const } : {}),
    };
    const label = plainLabel(c.getAttribute('value') ?? '');
    out.push(label ? { ...line, label: label.slice(0, 500) } : line);
  }
  return { elements: out, skipped };
}
