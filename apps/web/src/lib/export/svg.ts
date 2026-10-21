import type {
  BoardElement,
  EmbedElement,
  Bounds,
  FrameElement,
  ImageElement,
  LineElement,
  PathElement,
  ShapeElement,
  StickyElement,
  TableElement,
  TextElement,
  RichParagraph,
} from '@prostor/shared';
import { midpointOf } from '@/lib/canvas/connectors';
import { TABLE_CELL_PADDING, cellText, tableLayout } from '@/lib/canvas/table';
import { EMBED_CARD } from '@/lib/canvas/element-factory';
import { isRichFormatted } from '@prostor/shared';
import { compareRenderOrder } from '@/lib/canvas/frames';
import { layoutRich } from '@/lib/rich-text/layout';
import { layoutText, type Measure } from '@/lib/export/text-layout';

/**
 * Векторный экспорт доски.
 *
 * Слои: каждый фрейм — отдельный слой (<g inkscape:groupmode="layer">) со своим
 * содержимым, объекты вне фреймов — слой «Доска»; группы Ctrl+G — вложенные <g>.
 * Figma, Illustrator и Inkscape открывают такие слои как отдельные.
 * Геометрия повторяет компоненты в components/canvas/shapes (Konva).
 */
export interface SvgExportOptions {
  bounds: Bounds;
  /** null — прозрачный фон */
  background: string | null;
  /** assetId → data: URL (SVG должен быть самодостаточным) */
  images: ReadonlyMap<string, string>;
  /** Ширина строки для шрифта CSS вида «bold 16px Inter» */
  measure: (text: string, font: string) => number;
  fontFamily?: string;
}

const FONT = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''));

function attrs(record: Record<string, string | number | undefined | null>): string {
  return Object.entries(record)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}="${typeof v === 'number' ? n(v) : escapeXml(v as string)}"`)
    .join(' ');
}

function wrapElement(el: BoardElement, body: string): string {
  const transform = `translate(${n(el.x)} ${n(el.y)})${el.rotation ? ` rotate(${n(el.rotation)})` : ''}`;
  return `<g ${attrs({ id: `el-${el.id}`, 'data-type': el.type, transform, opacity: el.opacity < 1 ? el.opacity : undefined })}>${body}</g>`;
}

interface TextStyle {
  fontSize: number;
  fontWeight?: string;
  fontStyle?: string;
  color: string;
}

function textBlock(
  box: {
    text: string;
    rich?: RichParagraph[];
    x: number;
    y: number;
    width: number;
    height: number;
    align: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
    ellipsis: boolean;
  },
  style: TextStyle,
  opts: SvgExportOptions,
): string {
  if (!box.text) return '';
  const weight = style.fontWeight === 'bold' ? 'bold' : 'normal';
  const italic = style.fontStyle === 'italic' ? 'italic ' : '';
  const family = opts.fontFamily ?? FONT;
  if (box.rich && isRichFormatted(box.rich))
    return richBlock({ ...box, rich: box.rich }, style, family, opts);
  const measure: Measure = (t) =>
    opts.measure(t, `${italic}${weight} ${style.fontSize}px ${family}`);
  const { lines, anchor } = layoutText({ ...box, fontSize: style.fontSize }, measure);
  const tspans = lines
    .map((l) => `<tspan ${attrs({ x: box.x + l.x, y: box.y + l.y })}>${escapeXml(l.text)}</tspan>`)
    .join('');
  return `<text ${attrs({
    'font-family': family,
    'font-size': style.fontSize,
    'font-weight': weight === 'bold' ? 'bold' : undefined,
    'font-style': italic ? 'italic' : undefined,
    fill: style.color,
    'text-anchor': anchor,
    'dominant-baseline': 'central',
    'xml:space': 'preserve',
  })}>${tspans}</text>`;
}

/** Форматированный текст: по <text> на фрагмент строки (та же раскладка, что на холсте) */
function richBlock(
  box: {
    rich: RichParagraph[];
    x: number;
    y: number;
    width: number;
    height: number;
    align: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
    ellipsis: boolean;
  },
  style: TextStyle,
  family: string,
  opts: SvgExportOptions,
): string {
  const lines = layoutRich(
    box.rich,
    {
      width: box.width,
      height: box.height,
      fontSize: style.fontSize,
      family,
      bold: style.fontWeight === 'bold',
      italic: style.fontStyle === 'italic',
      align: box.align,
      verticalAlign: box.verticalAlign,
      ellipsis: box.ellipsis,
    },
    opts.measure,
  );
  const parts: string[] = [];
  for (const line of lines) {
    if (line.bulletX !== undefined) {
      const x = box.x + line.bulletX + style.fontSize * 0.15;
      parts.push(`<text ${attrs({ x, y: box.y + line.y })}>•</text>`);
    }
    for (const seg of line.segments) {
      const decoration = [seg.underline ? 'underline' : '', seg.strike ? 'line-through' : '']
        .filter(Boolean)
        .join(' ');
      const a = attrs({
        x: box.x + seg.x,
        y: box.y + line.y,
        'font-weight': seg.bold || style.fontWeight === 'bold' ? 'bold' : undefined,
        'font-style': seg.italic || style.fontStyle === 'italic' ? 'italic' : undefined,
        'text-decoration': decoration || undefined,
      });
      parts.push(`<text ${a}>${escapeXml(seg.text)}</text>`);
    }
  }
  const group = attrs({
    'font-family': family,
    'font-size': style.fontSize,
    fill: style.color,
    'dominant-baseline': 'central',
    'xml:space': 'preserve',
  });
  return `<g ${group}>${parts.join('')}</g>`;
}

function shapeOutline(el: ShapeElement): string {
  const w = el.width;
  const h = el.height;
  const paint = attrs({ fill: el.fill, stroke: el.stroke, 'stroke-width': el.strokeWidth });
  switch (el.shape) {
    case 'rect':
      return `<rect ${attrs({ width: w, height: h })} ${paint}/>`;
    case 'roundRect': {
      const r = Math.min(w, h) * 0.15;
      return `<rect ${attrs({ width: w, height: h, rx: r, ry: r })} ${paint}/>`;
    }
    case 'ellipse':
      return `<ellipse ${attrs({ cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 })} ${paint}/>`;
    case 'triangle':
      return `<polygon points="${n(w / 2)},0 ${n(w)},${n(h)} 0,${n(h)}" ${paint}/>`;
    case 'diamond':
      return `<polygon points="${n(w / 2)},0 ${n(w)},${n(h / 2)} ${n(w / 2)},${n(h)} 0,${n(h / 2)}" ${paint}/>`;
    case 'star': {
      // Как Konva.Star: первая вершина смотрит вверх
      const outer = Math.min(w, h) / 2;
      const inner = Math.min(w, h) / 4;
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i * Math.PI) / 5;
        pts.push(`${n(w / 2 + r * Math.sin(a))},${n(h / 2 - r * Math.cos(a))}`);
      }
      return `<polygon points="${pts.join(' ')}" ${paint}/>`;
    }
  }
}

function sticky(el: StickyElement, opts: SvgExportOptions): string {
  const pad = 14;
  return [
    `<rect ${attrs({ width: el.width, height: el.height, rx: 3, fill: el.fill, stroke: 'rgba(0,0,0,0.08)', 'stroke-width': 1 })}/>`,
    `<rect ${attrs({ y: el.height - 6, width: el.width, height: 6, fill: 'rgba(0,0,0,0.06)' })}/>`,
    textBlock(
      {
        text: el.text,
        rich: el.rich,
        x: pad,
        y: pad,
        width: Math.max(0, el.width - pad * 2),
        height: Math.max(0, el.height - pad * 2 - (el.authorName ? 16 : 0)),
        align: el.align,
        verticalAlign: el.verticalAlign,
        ellipsis: true,
      },
      {
        fontSize: el.fontSize,
        fontWeight: el.fontWeight,
        fontStyle: el.fontStyle,
        color: el.textColor,
      },
      opts,
    ),
    el.text && el.authorName
      ? textBlock(
          {
            text: el.authorName,
            x: pad,
            y: el.height - pad - 12,
            width: el.width - pad * 2,
            height: 12,
            align: 'left',
            verticalAlign: 'top',
            ellipsis: true,
          },
          { fontSize: 11, color: 'rgba(0,0,0,0.45)' },
          opts,
        )
      : '',
  ].join('');
}

function shape(el: ShapeElement, opts: SvgExportOptions): string {
  const pad = 8;
  return (
    shapeOutline(el) +
    textBlock(
      {
        text: el.text ?? '',
        rich: el.rich,
        x: pad,
        y: pad,
        width: Math.max(0, el.width - pad * 2),
        height: Math.max(0, el.height - pad * 2),
        align: 'center',
        verticalAlign: 'middle',
        ellipsis: true,
      },
      {
        fontSize: el.fontSize,
        fontWeight: el.fontWeight,
        fontStyle: el.fontStyle,
        color: el.textColor,
      },
      opts,
    )
  );
}

function text(el: TextElement, opts: SvgExportOptions): string {
  return textBlock(
    {
      text: el.text,
      rich: el.rich,
      x: 0,
      y: 0,
      width: el.width,
      height: el.height,
      align: el.align,
      verticalAlign: el.verticalAlign,
      ellipsis: false,
    },
    {
      fontSize: el.fontSize,
      fontWeight: el.fontWeight,
      fontStyle: el.fontStyle,
      color: el.textColor,
    },
    opts,
  );
}

function arrowHead(
  tipX: number,
  tipY: number,
  angle: number,
  length: number,
  width: number,
  color: string,
): string {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const bx = tipX - length * cos;
  const by = tipY - length * sin;
  const px = (width / 2) * -sin;
  const py = (width / 2) * cos;
  return `<polygon points="${n(tipX)},${n(tipY)} ${n(bx + px)},${n(by + py)} ${n(bx - px)},${n(by - py)}" ${attrs({ fill: color, stroke: color })}/>`;
}

function line(el: LineElement): string {
  const p = el.points;
  const pts: string[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) pts.push(`${n(p[i] ?? 0)},${n(p[i + 1] ?? 0)}`);
  const curved = el.routing === 'curved' && p.length >= 6;
  const geometry = curved
    ? `<path ${attrs({ d: smoothPath(p, 0.5) })}`
    : `<polyline points="${pts.join(' ')}"`;
  let out = `${geometry} ${attrs({
    fill: 'none',
    stroke: el.stroke,
    'stroke-width': el.strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-dasharray': el.dash?.join(' '),
  })}/>`;
  const head = Math.max(8, el.strokeWidth * 3);
  const len = p.length;
  const end = el.type === 'arrow' ? el.endArrow !== 'none' : el.endArrow === 'arrow';
  if (end && len >= 4) {
    const angle = Math.atan2(
      (p[len - 1] ?? 0) - (p[len - 3] ?? 0),
      (p[len - 2] ?? 0) - (p[len - 4] ?? 0),
    );
    out += arrowHead(p[len - 2] ?? 0, p[len - 1] ?? 0, angle, head, head, el.stroke);
  }
  if (el.startArrow === 'arrow' && len >= 4) {
    const angle = Math.atan2((p[1] ?? 0) - (p[3] ?? 0), (p[0] ?? 0) - (p[2] ?? 0));
    out += arrowHead(p[0] ?? 0, p[1] ?? 0, angle, head, head, el.stroke);
  }
  const label = el.label?.trim();
  if (label) {
    // Плашка подписи в середине линии, как на холсте (ширина — по оценке длины текста)
    const mid = midpointOf(p);
    const w = label.length * 7.5 + 12;
    const h = 26;
    out += `<rect ${attrs({ x: mid.x - w / 2, y: mid.y - h / 2, width: w, height: h, rx: 6, fill: '#ffffff', stroke: el.stroke, 'stroke-width': 1 })}/>`;
    out += `<text ${attrs({ x: mid.x, y: mid.y + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-family': 'Inter, sans-serif', fill: '#1f2937' })}>${escapeXml(label)}</text>`;
  }
  return out;
}

/** Контрольные точки сглаживания — тот же алгоритм, что Konva.Line с tension */
function controlPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): [number, number, number, number] {
  const d01 = Math.hypot(x1 - x0, y1 - y0);
  const d12 = Math.hypot(x2 - x1, y2 - y1);
  const fa = (t * d01) / (d01 + d12);
  const fb = (t * d12) / (d01 + d12);
  return [x1 - fa * (x2 - x0), y1 - fa * (y2 - y0), x1 + fb * (x2 - x0), y1 + fb * (y2 - y0)];
}

export function smoothPath(points: readonly number[], tension = 0.4): string {
  const p = points;
  const at = (i: number) => p[i] ?? 0;
  if (p.length < 4) return '';
  if (p.length <= 4 || tension === 0) {
    const segs = [`M${n(at(0))} ${n(at(1))}`];
    for (let i = 2; i + 1 < p.length; i += 2) segs.push(`L${n(at(i))} ${n(at(i + 1))}`);
    return segs.join(' ');
  }
  const tp: number[] = [];
  for (let i = 2; i < p.length - 2; i += 2) {
    const cp = controlPoints(at(i - 2), at(i - 1), at(i), at(i + 1), at(i + 2), at(i + 3), tension);
    if (Number.isNaN(cp[0])) continue;
    tp.push(cp[0], cp[1], at(i), at(i + 1), cp[2], cp[3]);
  }
  const t = (i: number) => n(tp[i] ?? 0);
  const segs = [`M${n(at(0))} ${n(at(1))}`, `Q${t(0)} ${t(1)} ${t(2)} ${t(3)}`];
  let i = 4;
  while (i < tp.length - 2) {
    segs.push(`C${t(i)} ${t(i + 1)} ${t(i + 2)} ${t(i + 3)} ${t(i + 4)} ${t(i + 5)}`);
    i += 6;
  }
  segs.push(
    `Q${t(tp.length - 2)} ${t(tp.length - 1)} ${n(at(p.length - 2))} ${n(at(p.length - 1))}`,
  );
  return segs.join(' ');
}

function path(el: PathElement): string {
  const opacity = el.tool === 'highlighter' ? 0.35 : el.tool === 'marker' ? 0.85 : undefined;
  return `<path ${attrs({
    d: smoothPath(el.points),
    fill: 'none',
    stroke: el.stroke,
    'stroke-width': el.strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-opacity': opacity,
    style: el.tool === 'highlighter' ? 'mix-blend-mode:multiply' : undefined,
  })}/>`;
}

function image(el: ImageElement, opts: SvgExportOptions): string {
  const href = opts.images.get(el.assetId);
  if (!href) {
    return `<rect ${attrs({ width: el.width, height: el.height, fill: 'rgba(148,163,184,0.15)', stroke: '#94a3b8', 'stroke-dasharray': '6 4' })}/>`;
  }
  return `<image ${attrs({ width: el.width, height: el.height, href, preserveAspectRatio: 'none' })}>${el.alt ? `<title>${escapeXml(el.alt)}</title>` : ''}</image>`;
}

function frameBody(el: FrameElement, opts: SvgExportOptions): string {
  return (
    textBlock(
      {
        text: el.title,
        x: 0,
        y: -26,
        width: el.width,
        height: 20,
        align: 'left',
        verticalAlign: 'top',
        ellipsis: true,
      },
      { fontSize: 16, fontWeight: 'bold', color: '#64748b' },
      opts,
    ) +
    `<rect ${attrs({ width: el.width, height: el.height, rx: 6, fill: el.fill, stroke: 'rgba(100,116,139,0.35)', 'stroke-width': 1 })}/>`
  );
}

/** Таблица: фон, заголовок, сетка и текст ячеек той же раскладкой, что на холсте */
function table(el: TableElement, opts: SvgExportOptions): string {
  const { xs, ys } = tableLayout(el);
  const parts = [
    `<rect ${attrs({ width: el.width, height: el.height, fill: el.fill, stroke: el.stroke, 'stroke-width': 1 })}/>`,
  ];
  if (el.headerRow) {
    parts.push(`<rect ${attrs({ width: el.width, height: ys[1] ?? 0, fill: el.headerFill })}/>`);
  }
  for (let c = 1; c < el.cols; c++) {
    parts.push(
      `<line ${attrs({ x1: xs[c] ?? 0, y1: 0, x2: xs[c] ?? 0, y2: el.height, stroke: el.stroke, 'stroke-width': 1 })}/>`,
    );
  }
  for (let r = 1; r < el.rows; r++) {
    parts.push(
      `<line ${attrs({ x1: 0, y1: ys[r] ?? 0, x2: el.width, y2: ys[r] ?? 0, stroke: el.stroke, 'stroke-width': 1 })}/>`,
    );
  }
  parts.push(
    `<rect ${attrs({ width: el.width, height: el.height, fill: 'none', stroke: el.stroke, 'stroke-width': 1 })}/>`,
  );
  for (let r = 0; r < el.rows; r++) {
    for (let c = 0; c < el.cols; c++) {
      const text = cellText(el, r, c);
      if (!text) continue;
      const x = xs[c] ?? 0;
      const y = ys[r] ?? 0;
      parts.push(
        textBlock(
          {
            text,
            x: x + TABLE_CELL_PADDING,
            y: y + TABLE_CELL_PADDING,
            width: Math.max(0, (xs[c + 1] ?? el.width) - x - TABLE_CELL_PADDING * 2),
            height: Math.max(0, (ys[r + 1] ?? el.height) - y - TABLE_CELL_PADDING * 2),
            align: 'left',
            verticalAlign: 'middle',
            ellipsis: true,
          },
          {
            fontSize: el.fontSize,
            fontWeight: el.headerRow && r === 0 ? 'bold' : undefined,
            color: el.color,
          },
          opts,
        ),
      );
    }
  }
  return parts.join('');
}

/** Карточка ссылки: превью, заголовок, сайт; ссылка кликабельна в SVG */
function embed(el: EmbedElement, opts: SvgExportOptions): string {
  const media = Math.max(0, el.height - EMBED_CARD.textHeight);
  const href = el.imageAssetId ? opts.images.get(el.imageAssetId) : undefined;
  const clipId = `clip-${el.id}`;
  const parts = [
    `<rect ${attrs({ width: el.width, height: el.height, rx: 10, fill: '#ffffff', stroke: '#e2e8f0', 'stroke-width': 1 })}/>`,
  ];
  if (media > 0) {
    parts.push(
      `<clipPath id="${clipId}"><rect ${attrs({ width: el.width, height: media + 10, rx: 10 })}/></clipPath>`,
    );
    parts.push(
      href
        ? `<image ${attrs({ width: el.width, height: media, href, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${clipId})` })}/>`
        : `<rect ${attrs({ width: el.width, height: media, fill: '#f1f5f9', 'clip-path': `url(#${clipId})` })}/>`,
    );
  }
  parts.push(
    textBlock(
      {
        text: el.title,
        x: 16,
        y: media + 12,
        width: el.width - 28,
        height: 40,
        align: 'left',
        verticalAlign: 'top',
        ellipsis: true,
      },
      { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
      opts,
    ),
    textBlock(
      {
        text: el.siteName,
        x: 16,
        y: media + EMBED_CARD.textHeight - 24,
        width: el.width - 28,
        height: 18,
        align: 'left',
        verticalAlign: 'top',
        ellipsis: true,
      },
      { fontSize: 12, color: '#64748b' },
      opts,
    ),
  );
  return `<a ${attrs({ href: el.url, target: '_blank' })}>${parts.join('')}</a>`;
}

function placeholder(el: BoardElement): string {
  return `<rect ${attrs({ width: el.width, height: el.height, rx: 8, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-dasharray': '6 4' })}/>`;
}

export function elementToSvg(el: BoardElement, opts: SvgExportOptions): string {
  switch (el.type) {
    case 'sticky':
      return wrapElement(el, sticky(el as StickyElement, opts));
    case 'shape':
      return wrapElement(el, shape(el as ShapeElement, opts));
    case 'text':
      return wrapElement(el, text(el as TextElement, opts));
    case 'line':
    case 'arrow':
      return wrapElement(el, line(el as LineElement));
    case 'path':
      return wrapElement(el, path(el as PathElement));
    case 'image':
      return wrapElement(el, image(el as ImageElement, opts));
    case 'frame':
      return wrapElement(el, frameBody(el as FrameElement, opts));
    case 'table':
      return wrapElement(el, table(el as TableElement, opts));
    case 'embed':
      return wrapElement(el, embed(el as EmbedElement, opts));
    default:
      return wrapElement(el, placeholder(el));
  }
}

/** Элементы слоя; соседние члены одной группы — в общий <g> */
function layerBody(elements: BoardElement[], opts: SvgExportOptions): string {
  const out: string[] = [];
  const emittedGroups = new Set<string>();
  for (const el of elements) {
    if (!el.groupId) {
      out.push(elementToSvg(el, opts));
      continue;
    }
    if (emittedGroups.has(el.groupId)) continue;
    emittedGroups.add(el.groupId);
    const members = elements.filter((m) => m.groupId === el.groupId);
    out.push(
      `<g ${attrs({ id: `group-${el.groupId}`, 'data-type': 'group' })}>${members.map((m) => elementToSvg(m, opts)).join('')}</g>`,
    );
  }
  return out.join('');
}

function layer(id: string, label: string, body: string): string {
  return `<g ${attrs({ id, 'inkscape:groupmode': 'layer', 'inkscape:label': label })}>${body}</g>`;
}

export function elementsToSvg(elements: readonly BoardElement[], opts: SvgExportOptions): string {
  const sorted = [...elements].filter((el) => !el.hidden).sort(compareRenderOrder);
  const frames = sorted.filter((el): el is FrameElement => el.type === 'frame');
  const frameIds = new Set(frames.map((f) => f.id));
  const layers: string[] = [];
  for (const frame of frames) {
    const children = sorted.filter((el) => el.frameId === frame.id && el.type !== 'frame');
    layers.push(
      layer(
        `frame-${frame.id}`,
        frame.title || 'Фрейм',
        elementToSvg(frame, opts) + layerBody(children, opts),
      ),
    );
  }
  const loose = sorted.filter(
    (el) => el.type !== 'frame' && !(el.frameId && frameIds.has(el.frameId)),
  );
  if (loose.length > 0) layers.push(layer('board', 'Доска', layerBody(loose, opts)));

  const { bounds: b } = opts;
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  const bg = opts.background
    ? `<rect ${attrs({ x: b.minX, y: b.minY, width, height, fill: opts.background })}/>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `${attrs({ width, height, viewBox: `${n(b.minX)} ${n(b.minY)} ${n(width)} ${n(height)}` })}>` +
    bg +
    layers.join('') +
    `</svg>`
  );
}
