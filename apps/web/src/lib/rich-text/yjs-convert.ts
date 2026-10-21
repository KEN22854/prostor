import * as Y from 'yjs';
import type { RichParagraph, RichRun } from '@prostor/shared';
import { RICH_MARKS } from '@/lib/rich-text/schema';

/**
 * Y.XmlFragment (формат y-prosemirror) ⇄ абзацы RichParagraph.
 *
 * y-prosemirror хранит узел как Y.XmlElement(nodeName) с атрибутами узла,
 * текст — как Y.XmlText, где метки — атрибуты форматирования
 * ({ bold: {} } — значение = attrs метки).
 */
export function fragmentToRich(fragment: Y.XmlFragment): RichParagraph[] {
  const paragraphs: RichParagraph[] = [];
  for (const node of fragment.toArray()) {
    if (!(node instanceof Y.XmlElement) || node.nodeName !== 'paragraph') continue;
    const bullet = node.getAttribute('bullet') as unknown;
    const runs: RichRun[] = [];
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlText)) continue;
      for (const op of child.toDelta() as Array<{
        insert?: unknown;
        attributes?: Record<string, unknown>;
      }>) {
        if (typeof op.insert !== 'string' || op.insert.length === 0) continue;
        const run: RichRun = { text: op.insert };
        for (const mark of RICH_MARKS) {
          // y-prosemirror может добавлять к имени метки хеш (mark--abc) для пересекающихся меток
          const has = Object.keys(op.attributes ?? {}).some(
            (k) => k === mark || k.startsWith(`${mark}--`),
          );
          if (has) run[mark] = true;
        }
        const prev = runs[runs.length - 1];
        if (prev && RICH_MARKS.every((m) => Boolean(prev[m]) === Boolean(run[m])))
          prev.text += run.text;
        else runs.push(run);
      }
    }
    paragraphs.push(bullet === true || bullet === 'true' ? { bullet: true, runs } : { runs });
  }
  return paragraphs;
}

/** Абзацы → новый (ещё не встроенный в документ) Y.XmlFragment */
export function richToFragment(paragraphs: readonly RichParagraph[]): Y.XmlFragment {
  const fragment = new Y.XmlFragment();
  const nodes = (paragraphs.length > 0 ? paragraphs : [{ runs: [] }]).map((p) => {
    const el = new Y.XmlElement('paragraph');
    if (p.bullet) el.setAttribute('bullet', true as unknown as string);
    const text = new Y.XmlText();
    let offset = 0;
    for (const run of p.runs) {
      if (!run.text) continue;
      const attrs: Record<string, object> = {};
      for (const mark of RICH_MARKS) if (run[mark]) attrs[mark] = {};
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
