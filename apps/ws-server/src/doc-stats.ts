import * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';

const MAX_CONTENT_TEXT = 100_000;
/** Поля элементов, содержащие пользовательский текст */
const TEXT_FIELDS = ['text', 'title', 'speakerNotes', 'alt'] as const;

export interface DocStats {
  objectCount: number;
  /** Плоский текст доски для поиска на дашборде (Board.contentText) */
  contentText: string;
}

/** Плоский текст форматированного содержимого (y-prosemirror): абзацы через перевод строки */
function fragmentText(fragment: Y.XmlFragment): string {
  const lines: string[] = [];
  for (const node of fragment.toArray()) {
    if (!(node instanceof Y.XmlElement)) continue;
    let line = '';
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlText)) continue;
      for (const op of child.toDelta() as Array<{ insert?: unknown }>) {
        if (typeof op.insert === 'string') line += op.insert;
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value instanceof Y.Text) return value.toString();
  if (value instanceof Y.XmlFragment) return fragmentText(value);
  return null;
}

export function computeDocStats(doc: Y.Doc): DocStats {
  const elements = doc.getMap<unknown>(Y_KEYS.elements);
  const parts: string[] = [];
  let length = 0;

  for (const el of elements.values()) {
    if (!(el instanceof Y.Map) || length >= MAX_CONTENT_TEXT) continue;
    // Форматированный текст (content, Y.XmlFragment) главнее плоской копии text
    const content = el.get('content');
    const fields =
      content instanceof Y.XmlFragment ? ['content', ...TEXT_FIELDS.slice(1)] : TEXT_FIELDS;
    for (const field of fields) {
      const text = asText(el.get(field))?.trim();
      if (text) {
        parts.push(text);
        length += text.length + 1;
      }
    }
  }

  return {
    objectCount: elements.size,
    contentText: parts.join('\n').slice(0, MAX_CONTENT_TEXT),
  };
}
