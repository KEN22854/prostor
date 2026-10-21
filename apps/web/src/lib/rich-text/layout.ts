import type { RichParagraph, RichRun } from '@prostor/shared';

/**
 * Раскладка форматированного текста по строкам — общая для холста
 * (Konva.Shape) и экспорта в SVG. Повторяет поведение Konva.Text:
 * перенос по словам, межстрочный интервал = размер шрифта, многоточие
 * при нехватке высоты, выравнивание по горизонтали и вертикали.
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
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

export interface RichLine {
  /** Центр строки по вертикали (textBaseline = middle) */
  y: number;
  segments: RichSegment[];
  /** Маркер списка — у первой строки пункта */
  bulletX?: number;
}

interface Token {
  text: string;
  run: RichRun;
}

export function fontOf(
  opts: Pick<RichLayoutOptions, 'fontSize' | 'family' | 'bold' | 'italic'>,
  run: RichRun,
): string {
  const italic = opts.italic || run.italic;
  const bold = opts.bold || run.bold;
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${opts.fontSize}px ${opts.family}`;
}

function sameStyle(a: RichRun, b: RichRun): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strike) === Boolean(b.strike)
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

export function layoutRich(
  paragraphs: readonly RichParagraph[],
  opts: RichLayoutOptions,
  measure: MeasureFont,
): RichLine[] {
  const lh = opts.fontSize;
  const indent = Math.round(opts.fontSize * 1.1);
  /** wrapped — строка-продолжение абзаца после переноса */
  type Draft = {
    tokens: Token[];
    width: number;
    bullet: boolean;
    indent: number;
    wrapped: boolean;
  };
  const drafts: Draft[] = [];

  for (const p of paragraphs) {
    const offset = p.bullet ? indent : 0;
    const max = Math.max(1, opts.width - offset);
    let line: Draft = {
      tokens: [],
      width: 0,
      bullet: Boolean(p.bullet),
      indent: offset,
      wrapped: false,
    };
    const push = () => {
      drafts.push(line);
      line = { tokens: [], width: 0, bullet: false, indent: offset, wrapped: true };
    };
    for (const token of tokenize(p.runs)) {
      const font = fontOf(opts, token.run);
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

  let visibleDrafts = drafts;
  const maxLines = Math.floor(opts.height / lh);
  const truncated = opts.ellipsis && drafts.length > maxLines;
  if (truncated) visibleDrafts = drafts.slice(0, Math.max(0, maxLines));

  const total = visibleDrafts.length * lh;
  const top =
    opts.verticalAlign === 'middle'
      ? (opts.height - total) / 2
      : opts.verticalAlign === 'bottom'
        ? opts.height - total
        : 0;

  return visibleDrafts.map((d, i) => {
    // Склеиваем соседние токены одного стиля; хвостовой пробел строки не учитываем
    const segments: RichSegment[] = [];
    for (const t of d.tokens) {
      const last = segments[segments.length - 1];
      const run = t.run;
      if (
        last &&
        sameStyle(
          {
            bold: last.bold,
            italic: last.italic,
            underline: last.underline,
            strike: last.strike,
            text: '',
          },
          run,
        )
      ) {
        last.text += t.text;
      } else {
        segments.push({
          text: t.text,
          x: 0,
          width: 0,
          font: fontOf(opts, run),
          bold: Boolean(run.bold),
          italic: Boolean(run.italic),
          underline: Boolean(run.underline),
          strike: Boolean(run.strike),
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
    return { y: top + i * lh + lh / 2, segments, ...(d.bullet ? { bulletX: start } : {}) };
  });
}
