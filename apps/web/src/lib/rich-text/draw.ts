import type { RichLine, RichMarker } from '@/lib/rich-text/layout';

/** Маркер пункта: точка, номер или квадратик чек-листа (с галочкой) */
function drawMarker(
  c: CanvasRenderingContext2D,
  marker: RichMarker,
  y: number,
  family: string,
  color: string,
): void {
  const size = marker.size;
  c.fillStyle = color;
  if (marker.kind === 'bullet') {
    c.font = `${size}px ${family}`;
    c.fillText('•', marker.x + size * 0.15, y);
    return;
  }
  if (marker.kind === 'number') {
    c.font = `${size}px ${family}`;
    c.fillText(marker.label ?? '', marker.x, y);
    return;
  }
  const box = size * 0.7;
  const left = marker.x + size * 0.05;
  const top = y - box / 2;
  c.lineWidth = Math.max(1, size / 12);
  c.beginPath();
  c.roundRect(left, top, box, box, box * 0.22);
  if (!marker.checked) {
    c.strokeStyle = color;
    c.stroke();
    return;
  }
  c.fillStyle = '#9b6bdf';
  c.fill();
  c.strokeStyle = '#ffffff';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(left + box * 0.22, top + box * 0.52);
  c.lineTo(left + box * 0.43, top + box * 0.72);
  c.lineTo(left + box * 0.78, top + box * 0.3);
  c.stroke();
}

/**
 * Рисует разложенный форматированный текст: маркер-выделение, маркеры списков,
 * фрагменты своим шрифтом и цветом, подчёркивание и зачёркивание. Общий код
 * холста, мини-карты и дальнего масштаба — форматирование выглядит везде одинаково.
 */
export function drawRichLines(
  c: CanvasRenderingContext2D,
  lines: readonly RichLine[],
  family: string,
  color: string,
): void {
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  // Прозрачность объекта уже задана — умножаем на неё
  const alpha = c.globalAlpha;
  for (const line of lines) {
    c.globalAlpha = line.dim ? alpha * 0.5 : alpha;
    // Маркер под текстом — сначала фоны всей строки
    for (const seg of line.segments) {
      if (!seg.highlight || !seg.text) continue;
      c.fillStyle = seg.highlight;
      c.fillRect(seg.x - 1, line.y - line.height * 0.55, seg.width + 2, line.height * 1.1);
    }
    if (line.marker) drawMarker(c, line.marker, line.y, family, color);
    for (const seg of line.segments) {
      const thickness = Math.max(1, seg.size / 15);
      c.fillStyle = seg.color ?? color;
      c.font = seg.font;
      c.fillText(seg.text, seg.x, line.y);
      if (seg.underline) c.fillRect(seg.x, line.y + seg.size * 0.38, seg.width, thickness);
      if (seg.strike || line.dim)
        c.fillRect(seg.x, line.y - thickness / 2 + seg.size * 0.04, seg.width, thickness);
    }
  }
  c.globalAlpha = alpha;
}
