import type { Node as PMNode } from 'prosemirror-model';
import { splitBlockAs } from 'prosemirror-commands';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { richSchema, type RichValueMark } from '@/lib/rich-text/schema';

/**
 * Команды редактора текста объектов: списки трёх видов, заголовки,
 * цвет и маркер, «Markdown на лету» и Enter в пунктах списков.
 */
export type ListKind = 'bullet' | 'number' | 'check';

/** Вид списка абзаца (bullet хранится отдельным атрибутом — для старых досок) */
export function listKindOf(node: PMNode): ListKind | null {
  if (node.attrs.list === 'number' || node.attrs.list === 'check') return node.attrs.list;
  return node.attrs.bullet ? 'bullet' : null;
}

function listAttrs(node: PMNode, kind: ListKind | null): Record<string, unknown> {
  return {
    ...node.attrs,
    bullet: kind === 'bullet',
    list: kind === 'number' || kind === 'check' ? kind : null,
    checked: kind === 'check' ? Boolean(node.attrs.checked) : false,
  };
}

function eachParagraph(state: EditorState, fn: (node: PMNode, pos: number) => void): void {
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph') fn(node, pos);
  });
}

/** Список выбранного вида: включить для всех абзацев выделения или выключить, если уже он */
export const toggleList =
  (kind: ListKind): Command =>
  (state, dispatch) => {
    let all = true;
    eachParagraph(state, (node) => {
      if (listKindOf(node) !== kind) all = false;
    });
    if (dispatch) {
      const tr = state.tr;
      eachParagraph(state, (node, pos) =>
        tr.setNodeMarkup(pos, undefined, listAttrs(node, all ? null : kind)),
      );
      dispatch(tr);
    }
    return true;
  };

/** Заголовок уровня 1 или 2 (повторное нажатие — обычный абзац) */
export const toggleHeading =
  (level: 1 | 2): Command =>
  (state, dispatch) => {
    let all = true;
    eachParagraph(state, (node) => {
      if (node.attrs.heading !== level) all = false;
    });
    if (dispatch) {
      const tr = state.tr;
      eachParagraph(state, (node, pos) =>
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, heading: all ? 0 : level }),
      );
      dispatch(tr);
    }
    return true;
  };

/** Отметить пункт чек-листа, начинающийся в позиции pos */
export function toggleCheckedAt(state: EditorState, pos: number): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'paragraph' || node.attrs.list !== 'check') return null;
  return state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked });
}

/** Цвет текста или маркер на выделении; null — убрать */
export const setColorMark =
  (mark: RichValueMark, color: string | null): Command =>
  (state, dispatch) => {
    const type = richSchema.marks[mark]!;
    const { from, to, empty } = state.selection;
    if (!dispatch) return true;
    if (empty) {
      // Без выделения — цвет для следующего набираемого текста
      const marks = (state.storedMarks ?? state.selection.$from.marks()).filter(
        (m) => m.type !== type,
      );
      dispatch(state.tr.setStoredMarks(color ? [...marks, type.create({ color })] : marks));
      return true;
    }
    const tr = state.tr.removeMark(from, to, type);
    if (color) tr.addMark(from, to, type.create({ color }));
    dispatch(tr);
    return true;
  };

/** Enter в пустом пункте списка выходит из списка */
export const exitEmptyListItem: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const node = $from.parent;
  if (!empty || node.type.name !== 'paragraph' || !listKindOf(node) || node.content.size > 0)
    return false;
  dispatch?.(state.tr.setNodeMarkup($from.before(), undefined, listAttrs(node, null)));
  return true;
};

/** Enter: новый абзац того же вида списка (неотмеченный); заголовок не продолжается */
export const splitKeepingList = splitBlockAs((node) =>
  node.type.name === 'paragraph'
    ? {
        type: richSchema.nodes.paragraph!,
        attrs: { bullet: node.attrs.bullet, list: node.attrs.list, checked: false, heading: 0 },
      }
    : null,
);

/**
 * «Markdown на лету»: пробел после «-», «1.», «[]», «#» или «##» в начале абзаца
 * превращает его в пункт списка, чек-лист или заголовок.
 */
export function markdownShortcut(state: EditorState, from: number): Transaction | null {
  const $from = state.doc.resolve(from);
  const para = $from.parent;
  if (para.type.name !== 'paragraph') return null;
  const before = para.textBetween(0, $from.parentOffset);
  let attrs: Record<string, unknown> | null = null;
  if (/^[-*•]$/.test(before)) attrs = listAttrs(para, 'bullet');
  else if (/^\d+[.)]$/.test(before)) attrs = listAttrs(para, 'number');
  else if (/^\[[ xх]?\]$/i.test(before))
    attrs = { ...listAttrs(para, 'check'), checked: /[xх]/i.test(before) };
  else if (before === '#') attrs = { ...para.attrs, heading: 1 };
  else if (before === '##') attrs = { ...para.attrs, heading: 2 };
  if (!attrs) return null;
  const start = $from.start();
  return state.tr
    .delete(start, start + before.length)
    .setNodeMarkup($from.before(), undefined, attrs);
}
