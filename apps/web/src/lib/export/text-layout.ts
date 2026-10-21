/**
 * Разбиение текста на строки так же, как Konva.Text (wrap="word", ellipsis):
 * экспорт в SVG должен переносить строки там же, где холст.
 */
export type Measure = (text: string) => number;

/** Самый длинный префикс, помещающийся в ширину (бинарный поиск, как в Konva) */
function fitPrefix(line: string, maxWidth: number, measure: Measure): number {
  let low = 0;
  let high = line.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(line.slice(0, mid)) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let rest = paragraph;
    if (rest.length === 0 || maxWidth <= 0) {
      out.push(rest);
      continue;
    }
    while (rest.length > 0) {
      if (measure(rest) <= maxWidth) {
        out.push(rest);
        break;
      }
      let cut = Math.max(1, fitPrefix(rest, maxWidth, measure));
      // Перенос по последнему пробелу/дефису внутри помещающейся части; слово длиннее строки — режем
      const lastSpace = rest.lastIndexOf(' ', cut);
      const lastHyphen = rest.lastIndexOf('-', cut - 1);
      const breakAt = Math.max(lastSpace, lastHyphen >= 0 ? lastHyphen + 1 : -1);
      if (breakAt > 0) cut = breakAt;
      out.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
  }
  return out;
}

/** Обрезка по высоте с многоточием на последней видимой строке */
export function clampLines(lines: string[], maxLines: number, maxWidth: number, measure: Measure): string[] {
  if (lines.length <= maxLines) return lines;
  if (maxLines <= 0) return [];
  const visible = lines.slice(0, maxLines);
  let last = visible[maxLines - 1] ?? '';
  while (last.length > 0 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  visible[maxLines - 1] = `${last.trimEnd()}…`;
  return visible;
}

export interface TextBox {
  text: string;
  width: number;
  height: number;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  ellipsis: boolean;
}

export interface LaidOutLine {
  text: string;
  /** x точки привязки (text-anchor) и y центра строки */
  x: number;
  y: number;
}

/** Строки с координатами внутри блока (lineHeight = 1, как у Konva по умолчанию) */
export function layoutText(box: TextBox, measure: Measure): { lines: LaidOutLine[]; anchor: 'start' | 'middle' | 'end' } {
  const lh = box.fontSize;
  let lines = wrapText(box.text, box.width, measure);
  if (box.ellipsis) lines = clampLines(lines, Math.floor(box.height / lh), box.width, measure);
  const total = lines.length * lh;
  const top =
    box.verticalAlign === 'middle'
      ? (box.height - total) / 2
      : box.verticalAlign === 'bottom'
        ? box.height - total
        : 0;
  const x = box.align === 'center' ? box.width / 2 : box.align === 'right' ? box.width : 0;
  return {
    anchor: box.align === 'center' ? 'middle' : box.align === 'right' ? 'end' : 'start',
    lines: lines.map((text, i) => ({ text, x, y: top + i * lh + lh / 2 })),
  };
}
