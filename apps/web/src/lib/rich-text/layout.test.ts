import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { layoutRich, type RichLayoutOptions } from './layout';
import { richSchema } from './schema';
import { richToFragment } from './yjs-convert';

/** 10 px на символ, жирный — 12 px: видно, что метрика зависит от начертания */
const measure = (text: string, font: string) => text.length * (font.includes('bold') ? 12 : 10);

const base: RichLayoutOptions = {
  width: 100,
  height: 200,
  fontSize: 20,
  family: 'Inter',
  bold: false,
  italic: false,
  align: 'left',
  verticalAlign: 'top',
  ellipsis: true,
};

describe('layoutRich', () => {
  it('переносит по словам через границы фрагментов и сохраняет стили', () => {
    const lines = layoutRich(
      [{ runs: [{ text: 'один ' }, { text: 'два', bold: true }, { text: ' три четыре' }] }],
      base,
      measure,
    );
    expect(lines.map((l) => l.segments.map((s) => s.text).join(''))).toEqual([
      'один два',
      'три четыре',
    ]);
    expect(lines[0]?.segments.map((s) => [s.text, s.bold, s.x])).toEqual([
      ['один ', false, 0],
      ['два', true, 50],
    ]);
    expect(lines[1]?.y).toBe(30);
  });

  it('пункт списка — маркер и отступ', () => {
    const [line] = layoutRich([{ bullet: true, runs: [{ text: 'пункт' }] }], base, measure);
    expect(line?.bulletX).toBe(0);
    expect(line?.segments[0]?.x).toBe(22);
  });

  it('многоточие при нехватке высоты и выравнивание по центру', () => {
    const lines = layoutRich(
      [{ runs: [{ text: 'a b c d e f' }] }],
      { ...base, width: 40, height: 40, align: 'center' },
      measure,
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]?.segments[0]?.text.endsWith('…')).toBe(true);
    expect(lines[0]?.segments[0]?.x).toBe(5);
  });

  it('фрагмент, созданный из абзацев, читается схемой ProseMirror', () => {
    const doc = new Y.Doc();
    const map = doc.getMap<unknown>('el');
    map.set('content', richToFragment([{ bullet: true, runs: [{ text: 'жирный', bold: true }] }]));
    const node = yXmlFragmentToProseMirrorRootNode(map.get('content') as Y.XmlFragment, richSchema);
    expect(node.firstChild?.attrs.bullet).toBe(true);
    expect(node.firstChild?.firstChild?.marks.map((m) => m.type.name)).toEqual(['bold']);
  });
});
