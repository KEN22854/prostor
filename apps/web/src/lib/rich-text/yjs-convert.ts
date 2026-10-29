import * as Y from 'yjs';
import type { RichParagraph, RichRun } from '@prostor/shared';
import { RICH_MARKS, RICH_VALUE_MARKS } from '@/lib/rich-text/schema';

/**
 * Y.XmlFragment (формат y-prosemirror) ⇄ абзацы RichParagraph.
 *
 * y-prosemirror хранит узел как Y.XmlElement(nodeName) с атрибутами узла,
 * текст — как Y.XmlText, где метки — атрибуты форматирования
 * ({ bold: {} } — значение = attrs метки, { color: { color: '#f00' } }).
 */

/** Значение метки по имени: y-prosemirror может добавлять хеш (mark--abc) к имени */
function markValue(attributes: Record<string, unknown>, mark: string): unknown {
  for (const [k, v] of Object.entries(attributes)) {
    if (k === mark || k.startsWith(`${mark}--`)) return v ?? {};
  }
  return undefined;
}

function sameRun(a: RichRun, b: RichRun): boolean {
  return (
    RICH_MARKS.every((m) => Boolean(a[m]) === Boolean(b[m])) &&
    RICH_VALUE_MARKS.every((m) => a[m] === b[m])
  );
}

export function fragmentToRich(fragment: Y.XmlFragment): RichParagraph[] {
  const paragraphs: RichParagraph[] = [];
  for (const node of fragment.toArray()) {
    if (!(node instanceof Y.XmlElement) || node.nodeName !== 'paragraph') continue;
    const runs: RichRun[] = [];
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlText)) continue;
      for (const op of child.toDelta() as Array<{
        insert?: unknown;
        attributes?: Record<string, unknown>;
      }>) {
        if (typeof op.insert !== 'string' || op.insert.length === 0) continue;
        const run: RichRun = { text: op.insert };
        const attributes = op.attributes ?? {};
        for (const mark of RICH_MARKS)
          if (markValue(attributes, mark) !== undefined) run[mark] = true;
        for (const mark of RICH_VALUE_MARKS) {
          const value = markValue(attributes, mark) as { color?: unknown } | undefined;
          if (typeof value?.color === 'string') run[mark] = value.color;
        }
        const prev = runs[runs.length - 1];
        if (prev && sameRun(prev, run)) prev.text += run.text;
        else runs.push(run);
      }
    }
    paragraphs.push(paragraphAttrs(node, runs));
  }
  return paragraphs;
}

/** Атрибуты абзаца: в Yjs они могут лежать и значениями, и строками */
function paragraphAttrs(node: Y.XmlElement, runs: RichRun[]): RichParagraph {
  const attr = (name: string) => node.getAttribute(name) as unknown;
  const truthy = (v: unknown) => v === true || v === 'true';
  const p: RichParagraph = { runs };
  const list = attr('list');
  if (list === 'number' || list === 'check') {
    p.list = list;
    if (list === 'check' && truthy(attr('checked'))) p.checked = true;
  } else if (truthy(attr('bullet'))) {
    p.bullet = true;
  }
  const heading = Number(attr('heading'));
  if (heading === 1 || heading === 2) p.heading = heading;
  return p;
}

/** Абзацы → новый (ещё не встроенный в документ) Y.XmlFragment */
export function richToFragment(paragraphs: readonly RichParagraph[]): Y.XmlFragment {
  const fragment = new Y.XmlFragment();
  const nodes = (paragraphs.length > 0 ? paragraphs : [{ runs: [] }]).map((p: RichParagraph) => {
    const el = new Y.XmlElement('paragraph');
    // y-prosemirror кладёт атрибуты значениями — так же, чтобы схема их прочитала
    const set = (name: string, value: unknown) => el.setAttribute(name, value as unknown as string);
    if (p.bullet) set('bullet', true);
    if (p.list) set('list', p.list);
    if (p.checked) set('checked', true);
    if (p.heading) set('heading', p.heading);
    const text = new Y.XmlText();
    let offset = 0;
    for (const run of p.runs) {
      if (!run.text) continue;
      const attrs: Record<string, object> = {};
      for (const mark of RICH_MARKS) if (run[mark]) attrs[mark] = {};
      for (const mark of RICH_VALUE_MARKS) {
        const value = run[mark];
        if (value) attrs[mark] = { color: value };
      }
      text.insert(offset, run.text, attrs);
      offset += run.text.length;
    }
    el.insert(0, [text]);
    return el;
  });
  fragment.insert(0, nodes);
  return fragment;
}

/** Обычный текст → абзацы (по строке на абзац) */
export function plainToRich(text: string): RichParagraph[] {
  return text.split('\n').map((line) => ({ runs: line ? [{ text: line }] : [] }));
}
