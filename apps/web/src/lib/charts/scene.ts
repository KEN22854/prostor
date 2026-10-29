import type { ChartElement } from '@prostor/shared';

/**
 * Диаграмма как набор простых примитивов в локальных координатах (0,0)–(w,h).
 * Одна раскладка на всех: холст рисует их в Konva.Shape, экспорт — в SVG,
 * мини-карта — уменьшенно. Без внешних библиотек: столбцы, полосы, линии,
 * области, круговая и кольцевая.
 */
export type ChartPrimitive =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string; r?: number }
  | {
      t: 'line';
      points: number[];
      stroke: string;
      width: number;
      dash?: number[];
    }
  | { t: 'area'; points: number[]; fill: string; opacity: number }
  | {
      t: 'arc';
      cx: number;
      cy: number;
      r: number;
      inner: number;
      start: number;
      end: number;
      fill: string;
    }
  | { t: 'dot'; x: number; y: number; r: number; fill: string }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      color: string;
      align: 'left' | 'center' | 'right';
      bold?: boolean;
    };

export type ChartData = Pick<
  ChartElement,
  'chartType' | 'title' | 'labels' | 'series' | 'showLegend' | 'showValues'
>;

const AXIS = '#94a3b8';
const GRID = '#e2e8f0';
const LABEL = '#64748b';
const INK = '#1f2937';

/** Сиреневая палитра рядов по умолчанию */
export const CHART_COLORS = [
  '#9b6bdf',
  '#f472b6',
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
  '#22d3ee',
  '#f97316',
  '#4ade80',
  '#e879f9',
  '#94a3b8',
];

/** «Красивый» шаг шкалы: 1, 2, 2.5, 5 × 10^n */
export function niceStep(range: number, ticks: number): number {
  if (range <= 0) return 1;
  const raw = range / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const k = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return k * pow;
}

/** Короткая запись числа: 1 500 → «1,5 тыс», 2 000 000 → «2 млн» */
export function formatValue(v: number): string {
  const abs = Math.abs(v);
  const trim = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
  if (abs >= 1e9) return `${trim(v / 1e9)} млрд`;
  if (abs >= 1e6) return `${trim(v / 1e6)} млн`;
  if (abs >= 1e4) return `${trim(v / 1e3)} тыс`;
  return trim(v);
}

/** Ширина текста без измерения шрифтом — достаточно для раскладки подписей */
const approxWidth = (text: string, size: number) => text.length * size * 0.55;

function ellipsize(text: string, size: number, max: number): string {
  if (approxWidth(text, size) <= max) return text;
  const n = Math.max(1, Math.floor(max / (size * 0.55)) - 1);
  return `${text.slice(0, n)}…`;
}

export function chartScene(data: ChartData, w: number, h: number): ChartPrimitive[] {
  const out: ChartPrimitive[] = [];
  const pad = 16;
  let top = pad;
  if (data.title) {
    out.push({
      t: 'text',
      x: w / 2,
      y: top + 9,
      text: ellipsize(data.title, 16, w - pad * 2),
      size: 16,
      color: INK,
      align: 'center',
      bold: true,
    });
    top += 30;
  }
  const series = data.series.filter((s) => s.values.length > 0 || data.labels.length > 0);
  const radial = data.chartType === 'pie' || data.chartType === 'donut';

  // Легенда: для круговых — категории, для остальных — ряды (если их больше одного)
  const legend: Array<{ name: string; color: string }> = radial
    ? data.labels.map((l, i) => ({
        name: l,
        color: CHART_COLORS[i % CHART_COLORS.length] ?? '#9b6bdf',
      }))
    : series.length > 1
      ? series.map((s) => ({ name: s.name, color: s.color }))
      : [];
  let bottom = h - pad;
  if (data.showLegend && legend.length > 0) {
    const size = 11;
    const rows: Array<Array<{ name: string; color: string; width: number }>> = [[]];
    let rowWidth = 0;
    for (const item of legend) {
      const name = ellipsize(item.name, size, 120);
      const width = 14 + approxWidth(name, size) + 14;
      if (rowWidth + width > w - pad * 2 && rows[rows.length - 1]!.length > 0) {
        rows.push([]);
        rowWidth = 0;
      }
      rows[rows.length - 1]!.push({ ...item, name, width });
      rowWidth += width;
    }
    const shown = rows.slice(0, 3);
    bottom -= shown.length * 18;
    shown.forEach((row, ri) => {
      const total = row.reduce((sum, i) => sum + i.width, 0);
      let x = (w - total) / 2;
      const y = bottom + 10 + ri * 18;
      for (const item of row) {
        out.push({ t: 'rect', x, y: y - 5, w: 10, h: 10, fill: item.color, r: 3 });
        out.push({
          t: 'text',
          x: x + 14,
          y,
          text: item.name,
          size,
          color: LABEL,
          align: 'left',
        });
        x += item.width;
      }
    });
    bottom -= 6;
  }

  if (radial) return [...out, ...radialScene(data, w, top, bottom)];
  return [...out, ...cartesianScene(data, w, top, bottom)];
}

function radialScene(data: ChartData, w: number, top: number, bottom: number): ChartPrimitive[] {
  const out: ChartPrimitive[] = [];
  const values = (data.series[0]?.values ?? []).map((v) => Math.max(0, v));
  const total = values.reduce((a, b) => a + b, 0);
  const cx = w / 2;
  const cy = (top + bottom) / 2;
  const r = Math.max(4, Math.min(w / 2 - 20, (bottom - top) / 2));
  const inner = data.chartType === 'donut' ? r * 0.58 : 0;
  if (total <= 0) {
    out.push({ t: 'arc', cx, cy, r, inner, start: 0, end: Math.PI * 2, fill: GRID });
    return out;
  }
  let angle = -Math.PI / 2;
  values.forEach((v, i) => {
    if (v <= 0) return;
    const sweep = (v / total) * Math.PI * 2;
    const fill = CHART_COLORS[i % CHART_COLORS.length] ?? '#9b6bdf';
    out.push({ t: 'arc', cx, cy, r, inner, start: angle, end: angle + sweep, fill });
    if (data.showValues && sweep > 0.25) {
      const mid = angle + sweep / 2;
      const lr = inner > 0 ? (r + inner) / 2 : r * 0.62;
      out.push({
        t: 'text',
        x: cx + Math.cos(mid) * lr,
        y: cy + Math.sin(mid) * lr,
        text: `${Math.round((v / total) * 100)}%`,
        size: 12,
        color: '#ffffff',
        align: 'center',
        bold: true,
      });
    }
    angle += sweep;
  });
  if (inner > 0) {
    out.push({
      t: 'text',
      x: cx,
      y: cy,
      text: formatValue(total),
      size: Math.max(12, Math.min(28, inner * 0.45)),
      color: INK,
      align: 'center',
      bold: true,
    });
  }
  return out;
}

function cartesianScene(data: ChartData, w: number, top: number, bottom: number): ChartPrimitive[] {
  const out: ChartPrimitive[] = [];
  const horizontal = data.chartType === 'bar';
  const n = Math.max(1, data.labels.length, ...data.series.map((s) => s.values.length));
  const all = data.series.flatMap((s) => s.values);
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all, min === 0 ? 1 : 0);
  const step = niceStep(max - min, 4);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step || step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));

  const labelSize = 11;
  const tickLabelWidth = Math.max(...ticks.map((v) => approxWidth(formatValue(v), labelSize)));
  const catLabelWidth = Math.min(
    110,
    Math.max(0, ...data.labels.map((l) => approxWidth(l, labelSize))),
  );
  const left = 16 + (horizontal ? catLabelWidth + 6 : tickLabelWidth + 8);
  const right = w - 16;
  const plotBottom = bottom - (horizontal ? 16 : 18);
  const plotTop = top + 4;
  const pw = Math.max(1, right - left);
  const ph = Math.max(1, plotBottom - plotTop);

  // Значение → координата вдоль оси значений
  const valuePos = (v: number) =>
    horizontal ? left + ((v - lo) / (hi - lo)) * pw : plotBottom - ((v - lo) / (hi - lo)) * ph;

  // Сетка и подписи шкалы
  for (const v of ticks) {
    const p = valuePos(v);
    if (horizontal) {
      out.push({ t: 'line', points: [p, plotTop, p, plotBottom], stroke: GRID, width: 1 });
      out.push({
        t: 'text',
        x: p,
        y: plotBottom + 10,
        text: formatValue(v),
        size: labelSize,
        color: LABEL,
        align: 'center',
      });
    } else {
      out.push({ t: 'line', points: [left, p, right, p], stroke: GRID, width: 1 });
      out.push({
        t: 'text',
        x: left - 8,
        y: p,
        text: formatValue(v),
        size: labelSize,
        color: LABEL,
        align: 'right',
      });
    }
  }
  const zero = valuePos(0);
  out.push({
    t: 'line',
    points: horizontal ? [zero, plotTop, zero, plotBottom] : [left, zero, right, zero],
    stroke: AXIS,
    width: 1.2,
  });

  const band = (horizontal ? ph : pw) / n;
  // Подписи категорий (у вертикальных — пропускаем часть, если не помещаются)
  const every = horizontal
    ? Math.max(1, Math.ceil((labelSize + 4) / band))
    : Math.max(1, Math.ceil((Math.min(catLabelWidth, 90) + 6) / band));
  data.labels.forEach((label, i) => {
    if (i % every !== 0) return;
    const c = (horizontal ? plotTop : left) + band * (i + 0.5);
    out.push(
      horizontal
        ? {
            t: 'text',
            x: left - 6,
            y: c,
            text: ellipsize(label, labelSize, catLabelWidth),
            size: labelSize,
            color: LABEL,
            align: 'right',
          }
        : {
            t: 'text',
            x: c,
            y: plotBottom + 11,
            text: ellipsize(label, labelSize, Math.max(band * every - 4, 24)),
            size: labelSize,
            color: LABEL,
            align: 'center',
          },
    );
  });

  if (data.chartType === 'column' || data.chartType === 'bar') {
    const groups = data.series.length;
    const inner = band * 0.72;
    const barSize = inner / groups;
    data.series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const start = (horizontal ? plotTop : left) + band * i + (band - inner) / 2 + barSize * si;
        const a = valuePos(Math.min(0, v));
        const b = valuePos(Math.max(0, v));
        const thickness = Math.max(1, barSize - (groups > 1 ? 2 : 0));
        if (horizontal)
          out.push({ t: 'rect', x: a, y: start, w: b - a, h: thickness, fill: s.color, r: 3 });
        else
          out.push({
            t: 'rect',
            x: start,
            y: b,
            w: thickness,
            h: a - b,
            fill: s.color,
            r: 3,
          });
        if (data.showValues)
          out.push(
            horizontal
              ? {
                  t: 'text',
                  x: valuePos(v) + (v >= 0 ? 4 : -4),
                  y: start + thickness / 2,
                  text: formatValue(v),
                  size: 10,
                  color: INK,
                  align: v >= 0 ? 'left' : 'right',
                }
              : {
                  t: 'text',
                  x: start + thickness / 2,
                  y: valuePos(v) + (v >= 0 ? -8 : 8),
                  text: formatValue(v),
                  size: 10,
                  color: INK,
                  align: 'center',
                },
          );
      });
    });
    return out;
  }

  // Линии и области: точки в центрах полос
  data.series.forEach((s) => {
    const pts: number[] = [];
    s.values.forEach((v, i) => pts.push(left + band * (i + 0.5), valuePos(v)));
    if (pts.length === 0) return;
    if (data.chartType === 'area' && pts.length >= 4) {
      out.push({
        t: 'area',
        points: [pts[0]!, zero, ...pts, pts[pts.length - 2]!, zero],
        fill: s.color,
        opacity: 0.22,
      });
    }
    out.push({ t: 'line', points: pts, stroke: s.color, width: 2.5 });
    for (let i = 0; i + 1 < pts.length; i += 2) {
      out.push({ t: 'dot', x: pts[i]!, y: pts[i + 1]!, r: 3.5, fill: s.color });
      if (data.showValues)
        out.push({
          t: 'text',
          x: pts[i]!,
          y: pts[i + 1]! - 11,
          text: formatValue(s.values[i / 2] ?? 0),
          size: 10,
          color: INK,
          align: 'center',
        });
    }
  });
  return out;
}

/** Нарисовать примитивы на 2D-контексте (холст, мини-карта) */
export function drawChartScene(
  ctx: CanvasRenderingContext2D,
  scene: readonly ChartPrimitive[],
  options: { text: boolean; family: string },
): void {
  for (const p of scene) {
    switch (p.t) {
      case 'rect':
        ctx.fillStyle = p.fill;
        ctx.beginPath();
        if (p.r && p.w > 2 && p.h > 2)
          ctx.roundRect(p.x, p.y, p.w, p.h, Math.min(p.r, p.w / 2, p.h / 2));
        else ctx.rect(p.x, p.y, p.w, p.h);
        ctx.fill();
        break;
      case 'line':
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash(p.dash ?? []);
        ctx.beginPath();
        for (let i = 0; i + 1 < p.points.length; i += 2) {
          if (i === 0) ctx.moveTo(p.points[i]!, p.points[i + 1]!);
          else ctx.lineTo(p.points[i]!, p.points[i + 1]!);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      case 'area': {
        const alpha = ctx.globalAlpha;
        ctx.globalAlpha = alpha * p.opacity;
        ctx.fillStyle = p.fill;
        ctx.beginPath();
        for (let i = 0; i + 1 < p.points.length; i += 2) {
          if (i === 0) ctx.moveTo(p.points[i]!, p.points[i + 1]!);
          else ctx.lineTo(p.points[i]!, p.points[i + 1]!);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = alpha;
        break;
      }
      case 'arc':
        ctx.fillStyle = p.fill;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, p.start, p.end);
        if (p.inner > 0) ctx.arc(p.cx, p.cy, p.inner, p.end, p.start, true);
        else ctx.lineTo(p.cx, p.cy);
        ctx.closePath();
        ctx.fill();
        // Тонкий белый зазор между секторами
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      case 'dot':
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = p.fill;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      case 'text':
        if (!options.text) break;
        ctx.fillStyle = p.color;
        ctx.font = `${p.bold ? 'bold ' : ''}${p.size}px ${options.family}`;
        ctx.textAlign = p.align;
        ctx.textBaseline = 'middle';
        ctx.fillText(p.text, p.x, p.y);
        break;
    }
  }
}

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Сектор круга/кольца как путь SVG */
function arcPath(p: Extract<ChartPrimitive, { t: 'arc' }>): string {
  const full = p.end - p.start >= Math.PI * 2 - 1e-6;
  const pt = (r: number, a: number) =>
    `${r2(p.cx + Math.cos(a) * r)} ${r2(p.cy + Math.sin(a) * r)}`;
  if (full) {
    // Полный круг — двумя полуокружностями (одна дуга с совпадающими концами не рисуется)
    const mid = p.start + Math.PI;
    const outer = `M${pt(p.r, p.start)} A${r2(p.r)} ${r2(p.r)} 0 1 1 ${pt(p.r, mid)} A${r2(p.r)} ${r2(p.r)} 0 1 1 ${pt(p.r, p.start)} Z`;
    if (p.inner <= 0) return outer;
    return `${outer} M${pt(p.inner, p.start)} A${r2(p.inner)} ${r2(p.inner)} 0 1 0 ${pt(p.inner, mid)} A${r2(p.inner)} ${r2(p.inner)} 0 1 0 ${pt(p.inner, p.start)} Z`;
  }
  const large = p.end - p.start > Math.PI ? 1 : 0;
  if (p.inner <= 0)
    return `M${r2(p.cx)} ${r2(p.cy)} L${pt(p.r, p.start)} A${r2(p.r)} ${r2(p.r)} 0 ${large} 1 ${pt(p.r, p.end)} Z`;
  return `M${pt(p.r, p.start)} A${r2(p.r)} ${r2(p.r)} 0 ${large} 1 ${pt(p.r, p.end)} L${pt(p.inner, p.end)} A${r2(p.inner)} ${r2(p.inner)} 0 ${large} 0 ${pt(p.inner, p.start)} Z`;
}

/** Примитивы диаграммы → фрагмент SVG (экспорт) */
export function chartSceneToSvg(scene: readonly ChartPrimitive[], family: string): string {
  const pts = (points: readonly number[]) => {
    const out: string[] = [];
    for (let i = 0; i + 1 < points.length; i += 2)
      out.push(`${r2(points[i]!)},${r2(points[i + 1]!)}`);
    return out.join(' ');
  };
  return scene
    .map((p) => {
      switch (p.t) {
        case 'rect':
          return `<rect x="${r2(p.x)}" y="${r2(p.y)}" width="${r2(p.w)}" height="${r2(p.h)}"${p.r ? ` rx="${r2(Math.min(p.r, p.w / 2, p.h / 2))}"` : ''} fill="${esc(p.fill)}"/>`;
        case 'line':
          return `<polyline points="${pts(p.points)}" fill="none" stroke="${esc(p.stroke)}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
        case 'area':
          return `<polygon points="${pts(p.points)}" fill="${esc(p.fill)}" fill-opacity="${p.opacity}"/>`;
        case 'arc':
          return `<path d="${arcPath(p)}" fill="${esc(p.fill)}" fill-rule="evenodd" stroke="#ffffff" stroke-width="1.5"/>`;
        case 'dot':
          return `<circle cx="${r2(p.x)}" cy="${r2(p.y)}" r="${p.r}" fill="#ffffff" stroke="${esc(p.fill)}" stroke-width="2"/>`;
        case 'text': {
          const anchor = p.align === 'center' ? 'middle' : p.align === 'right' ? 'end' : 'start';
          return `<text x="${r2(p.x)}" y="${r2(p.y)}" font-family="${esc(family)}" font-size="${p.size}"${p.bold ? ' font-weight="bold"' : ''} fill="${esc(p.color)}" text-anchor="${anchor}" dominant-baseline="central">${esc(p.text)}</text>`;
        }
      }
    })
    .join('');
}
