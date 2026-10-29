import type { RichParagraph, RichRun } from '@prostor/shared';
import { HEADING_SCALE } from '@/lib/rich-text/schema';

/**
 * Раскладка форматированного текста по строкам — общая для холста
 * (Konva.Shape) и экспорта в SVG. Повторяет поведение Konva.Text:
 * перенос по словам, межстрочный интервал = размер шрифта строки, многоточие
 * при нехватке высоты, выравнивание по горизонтали и вертикали.
 * Заголовки крупнее и жирнее, у пунктов списков — маркер и отступ.
 */
export type MeasureFont = (text: string, font: string) => number;

export interface RichLayoutOptions {
  width: number;
  height: number;
  fontSize: number;
  family: string;
  /** Базовое начертание элемента (fontWeight/fontStyle) — метки добавляются к нему */
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  ellipsis: boolean;
}

export interface RichSegment {
  text: string;
  x: number;
  width: number;
  font: string;
  /** Размер шрифта сегмента (у заголовков больше базового) */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** Свой цвет текста (иначе — цвет элемента) */
  color?: string;
  /** Цвет маркера под текстом */
  highlight?: string;
}

export interface RichMarker {
  kind: 'bullet' | 'number' | 'check';
  x: number;
  /** «3.» у нумерованного списка */
  label?: string;
  checked?: boolean;
  size: number;
}

export interface RichLine {
  /** Центр строки по вертикали (textBaseline = middle) */
  y: number;
  /** Высота строки = размер шрифта строки */
  height: number;
  segments: RichSegment[];
  /** Маркер списка — у первой строки пункта */
  marker?: RichMarker;
  /** Маркер маркированного списка (то же, что marker.x у bullet) */
  bulletX?: number;
  /** Отмеченный пункт чек-листа — текст рисуется приглушённым */
  dim?: boolean;
}

interface Token {
  text: string;
  run: RichRun;
}

interface ParaStyle {
  size: number;
  bold: boolean;
}

export function fontOf(
  opts: Pick<RichLayoutOptions, 'fontSize' | 'family' | 'bold' | 'italic'>,
  run: RichRun,
  size = opts.fontSize,
): string {
  const italic = opts.italic || run.italic;
  const bold = opts.bold || run.bold;
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${opts.family}`;
}

function sameStyle(a: RichSegment, b: RichRun): boolean {
  return (
    a.bold === Boolean(b.bold) &&
    a.italic === Boolean(b.italic) &&
    a.underline === Boolean(b.underline) &&
    a.strike === Boolean(b.strike) &&
    a.color === b.color &&
    a.highlight === b.highlight
  );
}

/** Слова с хвостовыми пробелами — единицы переноса */
function tokenize(runs: readonly RichRun[]): Token[] {
  const tokens: Token[] = [];
  for (const run of runs) {
    for (const m of run.text.matchAll(/\S+\s*|\s+/g)) tokens.push({ text: m[0], run });
  }
  return tokens;
}

function paraStyle(p: RichParagraph, opts: RichLayoutOptions): ParaStyle {
  if (!p.heading) return { size: opts.fontSize, bold: opts.bold };
  return { size: Math.round(opts.fontSize * HEADING_SCALE[p.heading]), bold: true };
}

const isListed = (p: RichParagraph) => Boolean(p.list || p.bullet);

export function layoutRich(
  paragraphs: readonly RichParagraph[],
  opts: RichLayoutOptions,
  measure: MeasureFont,
): RichLine[] {
  const indent = Math.round(opts.fontSize * 1.1);
  /** wrapped — строка-продолжение абзаца после переноса */
  type Draft = {
    tokens: Token[];
    width: number;
    indent: number;
    wrapped: boolean;
    style: ParaStyle;
    marker?: Omit<RichMarker, 'x'>;
    dim: boolean;
  };
  const drafts: Draft[] = [];
  let number = 0;

  for (const p of paragraphs) {
    number = p.list === 'number' ? number + 1 : 0;
    const style = paraStyle(p, opts);
    const runOpts = { ...opts, bold: style.bold };
    // Номера длиннее «9.» не помещаются в обычный отступ
    const numberIndent =
      p.list === 'number'
        ? Math.max(indent, measure(`${number}. `, fontOf(runOpts, { text: '' }, style.size)))
        : 0;
    const offset = !isListed(p) ? 0 : p.list === 'number' ? numberIndent : indent;
    const max = Math.max(1, opts.width - offset);
    const marker: Draft['marker'] = p.list
      ? p.list === 'number'
        ? { kind: 'number', label: `${number}.`, size: style.size }
        : { kind: 'check', checked: Boolean(p.checked), size: style.size }
      : p.bullet
        ? { kind: 'bullet', size: style.size }
        : undefined;
    const dim = p.list === 'check' && Boolean(p.checked);
    let line: Draft = { tokens: [], width: 0, indent: offset, wrapped: false, style, marker, dim };
    const push = () => {
      drafts.push(line);
      line = { tokens: [], width: 0, indent: offset, wrapped: true, style, dim };
    };
    for (const token of tokenize(p.runs)) {
      const font = fontOf(runOpts, token.run, style.size);
      const w = measure(token.text, font);
      const visible = measure(token.text.trimEnd(), font);
      // Пробелы в начале перенесённой строки не рисуем (как Konva)
      if (visible === 0 && line.tokens.length === 0 && line.wrapped) continue;
      if (line.tokens.length > 0 && line.width + visible > max) push();
      if (visible > max) {
        // Слово длиннее строки — режем по символам
        let rest = token.text;
        while (rest.length > 0) {
          let n = rest.length;
          while (n > 1 && line.width + measure(rest.slice(0, n), font) > max) n--;
          const part = rest.slice(0, n);
          line.tokens.push({ text: part, run: token.run });
          line.width += measure(part, font);
          rest = rest.slice(n);
          if (rest.length > 0) push();
        }
        continue;
      }
      line.tokens.push(token);
      line.width += w;
    }
    push();
  }

  // Сколько строк помещается по высоте (у заголовков строки выше)
  let visibleDrafts = drafts;
  let truncated = false;
  if (opts.ellipsis) {
    let used = 0;
    let count = 0;
    for (const d of drafts) {
      if (used + d.style.size > opts.height + 0.001) break;
      used += d.style.size;
      count++;
    }
    if (count < drafts.length) {
      truncated = true;
      visibleDrafts = drafts.slice(0, count);
    }
  }

  const total = visibleDrafts.reduce((sum, d) => sum + d.style.size, 0);
  const top =
    opts.verticalAlign === 'middle'
      ? (opts.height - total) / 2
      : opts.verticalAlign === 'bottom'
        ? opts.height - total
        : 0;

  let cursorY = top;
  return visibleDrafts.map((d, i) => {
    const runOpts = { ...opts, bold: d.style.bold };
    // Склеиваем соседние токены одного стиля; хвостовой пробел строки не учитываем
    const segments: RichSegment[] = [];
    for (const t of d.tokens) {
      const last = segments[segments.length - 1];
      const run = t.run;
      if (last && sameStyle(last, run)) {
        last.text += t.text;
      } else {
        segments.push({
          text: t.text,
          x: 0,
          width: 0,
          font: fontOf(runOpts, run, d.style.size),
          size: d.style.size,
          bold: Boolean(run.bold),
          italic: Boolean(run.italic),
          underline: Boolean(run.underline),
          strike: Boolean(run.strike),
          ...(run.color ? { color: run.color } : {}),
          ...(run.highlight ? { highlight: run.highlight } : {}),
        });
      }
    }
    let lastSeg = segments[segments.length - 1];
    if (lastSeg) lastSeg.text = lastSeg.text.trimEnd();
    // Хвост из одних пробелов другого стиля после обрезки пустой — убираем
    while (lastSeg && lastSeg.text === '' && segments.length > 1) {
      segments.pop();
      lastSeg = segments[segments.length - 1];
      if (lastSeg) lastSeg.text = lastSeg.text.trimEnd();
    }
    if (truncated && i === visibleDrafts.length - 1 && lastSeg) lastSeg.text = `${lastSeg.text}…`;
    for (const s of segments) s.width = measure(s.text, s.font);
    const lineWidth = d.indent + segments.reduce((sum, s) => sum + s.width, 0);
    const start =
      opts.align === 'center'
        ? (opts.width - lineWidth) / 2
        : opts.align === 'right'
          ? opts.width - lineWidth
          : 0;
    let x = start + d.indent;
    for (const s of segments) {
      s.x = x;
      x += s.width;
    }
    const height = d.style.size;
    const line: RichLine = { y: cursorY + height / 2, height, segments };
    cursorY += height;
    if (d.marker) {
      line.marker = { ...d.marker, x: start };
      if (d.marker.kind === 'bullet') line.bulletX = start;
    }
    if (d.dim) line.dim = true;
    return line;
  });
}
