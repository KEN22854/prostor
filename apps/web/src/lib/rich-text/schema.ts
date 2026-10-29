import { Schema, type MarkSpec } from 'prosemirror-model';

/**
 * Схема форматированного текста объектов доски. Намеренно маленькая:
 * абзацы (обычные, заголовки, пункты списков и чек-листов), четыре начертания,
 * цвет текста и выделение маркером. Всё это умеет рисовать холст
 * (components/canvas/shapes/rich-text) и экспорт в SVG.
 * Имена узлов, атрибутов и меток — часть формата хранения в Yjs
 * (y-prosemirror), переименовывать их нельзя без миграции.
 */
const simpleMark = (tags: string[], style?: { prop: string; match: RegExp }): MarkSpec => ({
  parseDOM: [
    ...tags.map((tag) => ({ tag })),
    ...(style
      ? [{ style: style.prop, getAttrs: (v: string) => (style.match.test(v) ? null : false) }]
      : []),
  ],
  toDOM: () => [tags[0] ?? 'span', 0],
});

/** Метка со значением-цветом: цвет текста или маркер */
const colorMark = (tag: string, cssProp: string, fallback: string): MarkSpec => ({
  attrs: { color: { default: fallback } },
  parseDOM: [
    {
      tag: `${tag}[data-color]`,
      getAttrs: (dom) => ({ color: (dom as HTMLElement).dataset.color ?? fallback }),
    },
  ],
  toDOM: (mark) => [
    tag,
    { 'data-color': mark.attrs.color as string, style: `${cssProp}: ${mark.attrs.color}` },
    0,
  ],
});

export const richSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: {
      content: 'text*',
      attrs: {
        bullet: { default: false },
        /** null | 'number' | 'check' */
        list: { default: null },
        checked: { default: false },
        /** 0 — обычный абзац, 1/2 — заголовок */
        heading: { default: 0 },
      },
      parseDOM: [
        { tag: 'li', attrs: { bullet: true } },
        { tag: 'h1', attrs: { heading: 1 } },
        { tag: 'h2', attrs: { heading: 2 } },
        {
          tag: 'p',
          getAttrs: (dom) => {
            const d = (dom as HTMLElement).dataset;
            return {
              bullet: d.bullet === 'true',
              list: d.list === 'number' || d.list === 'check' ? d.list : null,
              checked: d.checked === 'true',
              heading: d.heading === '1' ? 1 : d.heading === '2' ? 2 : 0,
            };
          },
        },
      ],
      toDOM: (node) => {
        const a = node.attrs;
        const dom: Record<string, string> = {};
        if (a.bullet && !a.list) dom['data-bullet'] = 'true';
        if (a.list) dom['data-list'] = a.list as string;
        if (a.list === 'check' && a.checked) dom['data-checked'] = 'true';
        if (a.heading) dom['data-heading'] = String(a.heading);
        return ['p', dom, 0];
      },
    },
    text: {},
  },
  marks: {
    bold: simpleMark(['strong', 'b'], { prop: 'font-weight', match: /^(bold|[6-9]00)$/ }),
    italic: simpleMark(['em', 'i'], { prop: 'font-style', match: /^italic$/ }),
    underline: simpleMark(['u'], { prop: 'text-decoration', match: /underline/ }),
    strike: simpleMark(['s', 'del'], { prop: 'text-decoration', match: /line-through/ }),
    color: colorMark('span', 'color', '#1f2937'),
    highlight: colorMark('mark', 'background-color', '#fef08a'),
  },
});

export type RichMark = 'bold' | 'italic' | 'underline' | 'strike';
export const RICH_MARKS: readonly RichMark[] = ['bold', 'italic', 'underline', 'strike'];
/** Метки со значением (цвет) — в RichRun хранятся строкой */
export type RichValueMark = 'color' | 'highlight';
export const RICH_VALUE_MARKS: readonly RichValueMark[] = ['color', 'highlight'];

/** Множитель размера шрифта заголовков */
export const HEADING_SCALE: Record<1 | 2, number> = { 1: 1.6, 2: 1.3 };
