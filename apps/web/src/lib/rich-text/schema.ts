import { Schema, type MarkSpec } from 'prosemirror-model';

/**
 * Схема форматированного текста объектов доски. Намеренно маленькая:
 * абзацы (обычные и пункты списка) и четыре начертания. Всё это умеет
 * рисовать холст (components/canvas/shapes/rich-text) и экспорт в SVG.
 * Имена узлов и меток — часть формата хранения в Yjs (y-prosemirror),
 * переименовывать их нельзя без миграции.
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

export const richSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: {
      content: 'text*',
      attrs: { bullet: { default: false } },
      parseDOM: [
        { tag: 'li', attrs: { bullet: true } },
        { tag: 'p', getAttrs: (dom) => ({ bullet: (dom as HTMLElement).dataset.bullet === 'true' }) },
      ],
      toDOM: (node) => ['p', node.attrs.bullet ? { 'data-bullet': 'true' } : {}, 0],
    },
    text: {},
  },
  marks: {
    bold: simpleMark(['strong', 'b'], { prop: 'font-weight', match: /^(bold|[6-9]00)$/ }),
    italic: simpleMark(['em', 'i'], { prop: 'font-style', match: /^italic$/ }),
    underline: simpleMark(['u'], { prop: 'text-decoration', match: /underline/ }),
    strike: simpleMark(['s', 'del'], { prop: 'text-decoration', match: /line-through/ }),
  },
});

export type RichMark = 'bold' | 'italic' | 'underline' | 'strike';
export const RICH_MARKS: readonly RichMark[] = ['bold', 'italic', 'underline', 'strike'];
