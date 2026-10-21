import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { RichParagraph } from '@prostor/shared';
import { fragmentToRich, plainToRich, richToFragment } from './yjs-convert';

describe('rich text ⇄ Y.XmlFragment', () => {
  const sample: RichParagraph[] = [
    { runs: [{ text: 'Обычный ' }, { text: 'жирный', bold: true }, { text: ' и ' }, { text: 'курсив', italic: true, underline: true }] },
    { bullet: true, runs: [{ text: 'пункт', strike: true }] },
    { runs: [] },
  ];

  it('туда и обратно без потерь (через встраивание в документ)', () => {
    const doc = new Y.Doc();
    const map = doc.getMap<unknown>('el');
    map.set('content', richToFragment(sample));
    expect(fragmentToRich(map.get('content') as Y.XmlFragment)).toEqual(sample);
  });

  it('переживает синхронизацию между документами', () => {
    const a = new Y.Doc();
    a.getMap<unknown>('el').set('content', richToFragment(sample));
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(fragmentToRich(b.getMap<unknown>('el').get('content') as Y.XmlFragment)).toEqual(sample);
  });

  it('соседние фрагменты с одинаковым стилем склеиваются', () => {
    const doc = new Y.Doc();
    const frag = doc.getXmlFragment('f');
    const p = new Y.XmlElement('paragraph');
    frag.insert(0, [p]);
    const t = new Y.XmlText();
    p.insert(0, [t]);
    t.insert(0, 'аб', { bold: {} });
    t.insert(2, 'вг', { 'bold--x1': {} });
    expect(fragmentToRich(frag)).toEqual([{ runs: [{ text: 'абвг', bold: true }] }]);
  });

  it('обычный текст — по абзацу на строку', () => {
    expect(plainToRich('a\n\nb')).toEqual([{ runs: [{ text: 'a' }] }, { runs: [] }, { runs: [{ text: 'b' }] }]);
  });
});
