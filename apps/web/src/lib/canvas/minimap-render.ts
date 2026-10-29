import { assetUrl, type BoardElement } from '@prostor/shared';
import { NEUTRAL_FILL } from '@/lib/canvas/constants';
import { tableLayout } from '@/lib/canvas/table';

/**
 * Отрисовка объектов на мини-карте — «как на доске, но в меру»:
 * настоящие формы и цвета, картинки (уменьшенные), линии со стрелками,
 * текст — буквами, когда он читается, иначе штрихами-строками.
 * Контекст уже переведён в мировые координаты (масштаб scale).
 */

/** Кэш картинок: загружаем один раз, по готовности просим перерисовать */
export class MinimapImages {
  private readonly cache = new Map<string, HTMLImageElement | 'loading' | 'error'>();
  constructor(private readonly onLoad: () => void) {}

  get(assetId: string): HTMLImageElement | null {
    const hit = this.cache.get(assetId);
    if (hit instanceof HTMLImageElement) return hit;
    if (hit) return null;
    const img = new Image();
    this.cache.set(assetId, 'loading');
    img.decoding = 'async';
    img.onload = () => {
      this.cache.set(assetId, img);
      this.onLoad();
    };
    img.onerror = () => this.cache.set(assetId, 'error');
    img.src = assetUrl(assetId);
    return null;
  }
}

const TEXT_MIN_PX = 3.5;

function shapePath(ctx: CanvasRenderingContext2D, kind: string, w: number, h: number): void {
  ctx.beginPath();
  switch (kind) {
    case 'ellipse':
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      break;
    case 'star': {
      const cx = w / 2;
      const cy = h / 2;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = cx + Math.cos(a) * (w / 2) * r;
        const y = cy + Math.sin(a) * (h / 2) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'roundRect':
      ctx.roundRect(0, 0, w, h, Math.min(w, h) * 0.15);
      break;
    default:
      ctx.rect(0, 0, w, h);
  }
}

/** Текст блока: буквами, если крупный, иначе полупрозрачными «строками» */
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; w: number; h: number },
  fontSize: number,
  color: string,
  align: 'left' | 'center' | 'right',
  scale: number,
): void {
  const lines = text.split('\n').filter((l, i, all) => l.trim() || i < all.length - 1);
  if (lines.length === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  if (fontSize * scale >= TEXT_MIN_PX) {
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = align;
    const x = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;
    lines.forEach((line, i) => ctx.fillText(line, x, box.y + i * fontSize * 1.15));
  } else {
    ctx.fillStyle = color;
    ctx.globalAlpha *= 0.35;
    const bar = fontSize * 0.55;
    lines.forEach((line, i) => {
      const y = box.y + i * fontSize * 1.2 + (fontSize - bar) / 2;
      if (y > box.y + box.h) return;
      const w = Math.min(box.w, line.length * fontSize * 0.5);
      if (w <= 0) return;
      const x =
        align === 'center'
          ? box.x + (box.w - w) / 2
          : align === 'right'
            ? box.x + box.w - w
            : box.x;
      ctx.fillRect(x, y, w, bar);
    });
  }
  ctx.restore();
}

function polyline(ctx: CanvasRenderingContext2D, pts: readonly number[]): void {
  ctx.beginPath();
  for (let i = 0; i + 1 < pts.length; i += 2) {
    if (i === 0) ctx.moveTo(pts[i] ?? 0, pts[i + 1] ?? 0);
    else ctx.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
  }
}

function arrowHead(
  ctx: CanvasRenderingContext2D,
  from: [number, number],
  to: [number, number],
  size: number,
): void {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  ctx.beginPath();
  ctx.moveTo(to[0], to[1]);
  ctx.lineTo(to[0] - Math.cos(a - 0.45) * size, to[1] - Math.sin(a - 0.45) * size);
  ctx.lineTo(to[0] - Math.cos(a + 0.45) * size, to[1] - Math.sin(a + 0.45) * size);
  ctx.closePath();
  ctx.fill();
}

/**
 * Один объект. scale — сколько пикселей мини-карты в единице мира:
 * от него зависят минимальная толщина линий и решение «буквы или штрихи».
 */
export function drawMinimapElement(
  ctx: CanvasRenderingContext2D,
  el: BoardElement,
  scale: number,
  images: MinimapImages,
): void {
  if (el.hidden) return;
  const px = 1 / scale;
  ctx.save();
  ctx.translate(el.x, el.y);
  if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
  ctx.globalAlpha = el.opacity ?? 1;
  const w = 'width' in el ? el.width : 0;
  const h = 'height' in el ? el.height : 0;

  switch (el.type) {
    case 'sticky': {
      ctx.fillStyle = el.fill;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, h - Math.max(px, h * 0.03), w, Math.max(px, h * 0.03));
      drawText(
        ctx,
        el.text,
        { x: 14, y: 14, w: w - 28, h: h - 28 },
        el.fontSize,
        el.textColor,
        el.align,
        scale,
      );
      break;
    }
    case 'shape': {
      shapePath(ctx, el.shape, w, h);
      if (el.fill !== 'transparent') {
        ctx.fillStyle = el.fill;
        ctx.fill();
      }
      if (el.strokeWidth > 0) {
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = Math.max(el.strokeWidth, px);
        ctx.stroke();
      }
      if (el.text)
        drawText(
          ctx,
          el.text,
          { x: 8, y: 8, w: w - 16, h: h - 16 },
          el.fontSize,
          el.textColor,
          'center',
          scale,
        );
      break;
    }
    case 'text':
      drawText(
        ctx,
        el.text,
        { x: 0, y: 0, w, h: Math.max(h, el.fontSize) },
        el.fontSize,
        el.textColor,
        el.align,
        scale,
      );
      break;
    case 'frame': {
      ctx.fillStyle = el.fill;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(100, 80, 140, 0.35)';
      ctx.lineWidth = px;
      ctx.strokeRect(0, 0, w, h);
      if (16 * scale >= TEXT_MIN_PX) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '16px Inter, system-ui, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText(el.title, 0, -6);
      }
      break;
    }
    case 'image': {
      const img = images.get(el.assetId);
      if (img) {
        const c = el.crop;
        if (c) ctx.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, w, h);
        else ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#e9e3f5';
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }
    case 'line':
    case 'arrow': {
      const pts = el.points;
      ctx.strokeStyle = el.stroke;
      ctx.fillStyle = el.stroke;
      ctx.lineWidth = Math.max(el.strokeWidth, px * 1.2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      polyline(ctx, pts);
      ctx.stroke();
      const n = pts.length;
      const head = Math.max(el.strokeWidth * 4, px * 4);
      if (n >= 4 && el.endArrow === 'arrow')
        arrowHead(
          ctx,
          [pts[n - 4] ?? 0, pts[n - 3] ?? 0],
          [pts[n - 2] ?? 0, pts[n - 1] ?? 0],
          head,
        );
      if (n >= 4 && el.startArrow === 'arrow')
        arrowHead(ctx, [pts[2] ?? 0, pts[3] ?? 0], [pts[0] ?? 0, pts[1] ?? 0], head);
      break;
    }
    case 'path': {
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = Math.max(el.strokeWidth, px);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (el.tool === 'highlighter') ctx.globalAlpha *= 0.35;
      polyline(ctx, el.points);
      ctx.stroke();
      break;
    }
    case 'table': {
      ctx.fillStyle = el.fill;
      ctx.fillRect(0, 0, w, h);
      const layout = tableLayout(el);
      if (el.headerRow && layout.ys.length > 1) {
        ctx.fillStyle = el.headerFill;
        ctx.fillRect(0, 0, w, layout.ys[1] ?? 0);
      }
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = px;
      ctx.beginPath();
      for (const y of layout.ys) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      for (const x of layout.xs) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      ctx.rect(0, 0, w, h);
      ctx.stroke();
      break;
    }
    case 'audio': {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 14);
      ctx.fill();
      ctx.fillStyle = el.color;
      ctx.beginPath();
      ctx.arc(38, h / 2, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha *= 0.5;
      ctx.fillRect(76, h / 2 - 3, w - 92, 6);
      break;
    }
    case 'embed': {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      const img = el.imageAssetId ? images.get(el.imageAssetId) : null;
      const imgH = h * 0.6;
      if (img) ctx.drawImage(img, 0, 0, w, imgH);
      else {
        ctx.fillStyle = '#ede7f8';
        ctx.fillRect(0, 0, w, imgH);
      }
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = px;
      ctx.strokeRect(0, 0, w, h);
      break;
    }
    default: {
      ctx.fillStyle = 'fill' in el && typeof el.fill === 'string' ? el.fill : NEUTRAL_FILL;
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.restore();
}
