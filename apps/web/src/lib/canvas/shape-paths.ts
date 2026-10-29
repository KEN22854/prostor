import type { ShapeElement } from '@prostor/shared';

/**
 * Контур фигуры как путь SVG в локальных координатах (0,0)–(w,h).
 * Одна геометрия на всех: холст (Konva.Path), экспорт в SVG, мини-карта
 * (Path2D) и превью в палитре — фигура везде выглядит одинаково.
 */
type Kind = ShapeElement['shape'];

const f = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** Путь из нормированных координат (сетка nw×nh) в реальный размер */
function scaled(d: string, nw: number, nh: number, w: number, h: number): string {
  let axis = 0;
  return d.replace(/-?\d+(\.\d+)?/g, (num) => {
    const v = Number(num) * (axis++ % 2 === 0 ? w / nw : h / nh);
    return f(v);
  });
}

const CLOUD =
  'M25 60 C10 60 0 50 2 40 C4 30 12 26 20 28 C20 14 34 4 48 8 C56 0 74 2 78 14 C90 12 100 22 98 34 C100 48 90 60 78 60 Z';

export function shapePathData(kind: Kind, w: number, h: number): string {
  switch (kind) {
    case 'rect':
      return `M0 0 H${f(w)} V${f(h)} H0 Z`;
    case 'roundRect': {
      const r = Math.min(w, h) * 0.15;
      return `M${f(r)} 0 H${f(w - r)} Q${f(w)} 0 ${f(w)} ${f(r)} V${f(h - r)} Q${f(w)} ${f(h)} ${f(w - r)} ${f(h)} H${f(r)} Q0 ${f(h)} 0 ${f(h - r)} V${f(r)} Q0 0 ${f(r)} 0 Z`;
    }
    case 'ellipse':
      return `M0 ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 1 0 ${f(w)} ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 1 0 0 ${f(h / 2)} Z`;
    case 'triangle':
      return `M${f(w / 2)} 0 L${f(w)} ${f(h)} H0 Z`;
    case 'diamond':
      return `M${f(w / 2)} 0 L${f(w)} ${f(h / 2)} L${f(w / 2)} ${f(h)} L0 ${f(h / 2)} Z`;
    case 'star': {
      const outer = Math.min(w, h) / 2;
      const inner = outer / 2;
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${f(w / 2 + Math.cos(a) * r)} ${f(h / 2 + Math.sin(a) * r)}`);
      }
      return `M${pts.join(' L')} Z`;
    }
    case 'pill': {
      const r = Math.min(w, h) / 2;
      return `M${f(r)} 0 H${f(w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)} H${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`;
    }
    case 'parallelogram': {
      const o = Math.min(w * 0.2, h);
      return `M${f(o)} 0 H${f(w)} L${f(w - o)} ${f(h)} H0 Z`;
    }
    case 'trapezoid':
      return `M0 0 H${f(w)} L${f(w * 0.82)} ${f(h)} H${f(w * 0.18)} Z`;
    case 'hexagon': {
      const o = Math.min(w * 0.2, h / 2);
      return `M${f(o)} 0 H${f(w - o)} L${f(w)} ${f(h / 2)} L${f(w - o)} ${f(h)} H${f(o)} L0 ${f(h / 2)} Z`;
    }
    case 'cylinder': {
      const rx = w / 2;
      const ry = Math.min(h * 0.15, w * 0.25);
      // Второй подпуть — передний край «крышки» (виден обводкой)
      return `M0 ${f(ry)} A${f(rx)} ${f(ry)} 0 0 1 ${f(w)} ${f(ry)} V${f(h - ry)} A${f(rx)} ${f(ry)} 0 0 1 0 ${f(h - ry)} Z M0 ${f(ry)} A${f(rx)} ${f(ry)} 0 0 0 ${f(w)} ${f(ry)}`;
    }
    case 'document':
      return `M0 0 H${f(w)} V${f(h * 0.85)} C${f(w * 0.75)} ${f(h * 0.7)} ${f(w * 0.25)} ${f(h * 1.0)} 0 ${f(h * 0.85)} Z`;
    case 'cloud':
      return scaled(CLOUD, 100, 60, w, h);
    case 'callout': {
      const bh = h * 0.78;
      const r = Math.min(w, bh) * 0.12;
      return `M${f(r)} 0 H${f(w - r)} Q${f(w)} 0 ${f(w)} ${f(r)} V${f(bh - r)} Q${f(w)} ${f(bh)} ${f(w - r)} ${f(bh)} H${f(w * 0.4)} L${f(w * 0.2)} ${f(h)} L${f(w * 0.24)} ${f(bh)} H${f(r)} Q0 ${f(bh)} 0 ${f(bh - r)} V${f(r)} Q0 0 ${f(r)} 0 Z`;
    }
    case 'blockArrow':
      return `M0 ${f(h * 0.3)} H${f(w * 0.62)} V0 L${f(w)} ${f(h / 2)} L${f(w * 0.62)} ${f(h)} V${f(h * 0.7)} H0 Z`;
    case 'plus': {
      const t = Math.min(w, h) / 3;
      const x1 = (w - t) / 2;
      const x2 = (w + t) / 2;
      const y1 = (h - t) / 2;
      const y2 = (h + t) / 2;
      return `M${f(x1)} 0 H${f(x2)} V${f(y1)} H${f(w)} V${f(y2)} H${f(x2)} V${f(h)} H${f(x1)} V${f(y2)} H0 V${f(y1)} H${f(x1)} Z`;
    }
  }
}

/** Фигуры, которые холст рисует путём (у первых шести — свои узлы Konva) */
export const PATH_SHAPES: ReadonlySet<Kind> = new Set([
  'pill',
  'parallelogram',
  'trapezoid',
  'hexagon',
  'cylinder',
  'document',
  'cloud',
  'callout',
  'blockArrow',
  'plus',
]);

/** Подписи фигур — для палитры и библиотеки */
export const SHAPE_LABELS: Record<Kind, string> = {
  rect: 'Прямоугольник',
  roundRect: 'Скруглённый',
  ellipse: 'Эллипс',
  triangle: 'Треугольник',
  diamond: 'Ромб',
  star: 'Звезда',
  pill: 'Капсула',
  parallelogram: 'Параллелограмм',
  trapezoid: 'Трапеция',
  hexagon: 'Шестиугольник',
  cylinder: 'Цилиндр',
  document: 'Документ',
  cloud: 'Облако',
  callout: 'Выноска',
  blockArrow: 'Стрелка-фигура',
  plus: 'Плюс',
};
