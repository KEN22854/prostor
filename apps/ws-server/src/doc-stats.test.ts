import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';
import { computeDocStats } from './doc-stats';

describe('computeDocStats', () => {
  it('считает элементы и собирает текст для поиска', () => {
    const doc = new Y.Doc();
    const elements = doc.getMap<unknown>('elements');
    const sticky = new Y.Map<unknown>();
    sticky.set('text', 'Идея: тёмная тема');
    const frame = new Y.Map<unknown>();
    frame.set('title', 'Спринт 12');
    const doc2 = new Y.Map<unknown>();
    const text = new Y.Text();
    text.insert(0, 'Rich text');
    doc2.set('text', text);
    const shape = new Y.Map<unknown>();
    shape.set('fill', '#fff');

    elements.set('a', sticky);
    elements.set('b', frame);
    elements.set('c', doc2);
    elements.set('d', shape);

    const stats = computeDocStats(doc);
    expect(stats.objectCount).toBe(4);
    expect(stats.contentText).toContain('Идея: тёмная тема');
    expect(stats.contentText).toContain('Спринт 12');
    expect(stats.contentText).toContain('Rich text');
  });
});

describe('computeDocStats: форматированный текст', () => {
  it('берёт текст из Y.XmlFragment (y-prosemirror)', () => {
    const doc = new Y.Doc();
    const el = new Y.Map<unknown>();
    doc.getMap<unknown>(Y_KEYS.elements).set('s', el);
    el.set('text', 'устарело');
    const fragment = new Y.XmlFragment();
    el.set('content', fragment);
    const p = new Y.XmlElement('paragraph');
    fragment.insert(0, [p]);
    const t = new Y.XmlText();
    p.insert(0, [t]);
    t.insert(0, 'Свежий ', {});
    t.insert(7, 'текст', { bold: {} });
    expect(computeDocStats(doc).contentText).toBe('Свежий текст');
  });
});
