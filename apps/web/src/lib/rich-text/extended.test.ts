import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { richToPlain, type RichParagraph } from '@prostor/shared';
import { markdownShortcut, setColorMark, toggleCheckedAt, toggleList } from './commands';
import { layoutRich, type RichLayoutOptions } from './layout';
import { richSchema } from './schema';
import { fragmentToRich, richToFragment } from './yjs-convert';

const measure = (text: string, font: string) => text.length * (font.includes('bold') ? 12 : 10);
const base: RichLayoutOptions = {
  width: 300,
  height: 400,
  fontSize: 20,
  family: 'Inter',
  bold: false,
  italic: false,
  align: 'left',
  verticalAlign: 'top',
  ellipsis: true,
};

describe('расширенный текст: заголовки, списки, цвет', () => {
  const sample: RichParagraph[] = [
    { heading: 1, runs: [{ text: 'План' }] },
    { list: 'number', runs: [{ text: 'первый' }] },
    { list: 'number', runs: [{ text: 'второй', color: '#e5484d' }] },
    { list: 'check', checked: true, runs: [{ text: 'готово', highlight: '#fef08a' }] },
    { list: 'check', runs: [{ text: 'в работе' }] },
  ];

  it('Yjs: туда и обратно, и схема ProseMirror понимает атрибуты и метки', () => {
    const doc = new Y.Doc();
    const map = doc.getMap<unknown>('el');
    map.set('content', richToFragment(sample));
    const fragment = map.get('content') as Y.XmlFragment;
    expect(fragmentToRich(fragment)).toEqual(sample);
    const node = yXmlFragmentToProseMirrorRootNode(fragment, richSchema);
    expect(node.child(0).attrs.heading).toBe(1);
    expect(node.child(3).attrs).toMatchObject({ list: 'check', checked: true });
    expect(node.child(2).firstChild?.marks[0]?.attrs.color).toBe('#e5484d');
  });

  it('раскладка: заголовок крупнее и жирнее, номера по порядку, галочка и приглушение', () => {
    const lines = layoutRich(sample, base, measure);
    expect(lines[0]?.height).toBe(32);
    expect(lines[0]?.segments[0]?.font).toContain('bold 32px');
    expect(lines[1]?.y).toBe(32 + 10);
    expect(lines.map((l) => l.marker?.label)).toEqual([
      undefined,
      '1.',
      '2.',
      undefined,
      undefined,
    ]);
    expect(lines[2]?.segments[0]?.color).toBe('#e5484d');
    expect(lines[3]?.marker).toMatchObject({ kind: 'check', checked: true });
    expect(lines[3]?.dim).toBe(true);
    expect(lines[3]?.segments[0]?.highlight).toBe('#fef08a');
    expect(lines[4]?.dim).toBeUndefined();
  });

  it('плоский текст с маркерами списков', () => {
    expect(richToPlain(sample)).toBe('План\n1. первый\n2. второй\n☑ готово\n☐ в работе');
  });
});

describe('команды редактора', () => {
  const stateWith = (text: string) => {
    const doc = richSchema.node('doc', null, [
      richSchema.node('paragraph', null, text ? [richSchema.text(text)] : []),
    ]);
    return EditorState.create({ doc, selection: TextSelection.atEnd(doc) });
  };

  it('«1.» и «[]» с пробелом — нумерованный список и чек-лист', () => {
    const numbered = markdownShortcut(stateWith('1.'), 3);
    expect(numbered?.doc.firstChild?.attrs.list).toBe('number');
    expect(numbered?.doc.firstChild?.textContent).toBe('');
    const check = markdownShortcut(stateWith('[x]'), 4);
    expect(check?.doc.firstChild?.attrs).toMatchObject({ list: 'check', checked: true });
    expect(markdownShortcut(stateWith('слово'), 6)).toBeNull();
  });

  it('переключение списка и отметка пункта', () => {
    let state = stateWith('дело');
    toggleList('check')(state, (tr) => (state = state.apply(tr)));
    expect(state.doc.firstChild?.attrs.list).toBe('check');
    const tr = toggleCheckedAt(state, 0);
    state = state.apply(tr!);
    expect(state.doc.firstChild?.attrs.checked).toBe(true);
    toggleList('check')(state, (t) => (state = state.apply(t)));
    expect(state.doc.firstChild?.attrs).toMatchObject({ list: null, checked: false });
  });

  it('цвет текста на выделении', () => {
    let state = stateWith('цветной');
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 4)));
    setColorMark('color', '#8e4ec6')(state, (tr) => (state = state.apply(tr)));
    const marks = state.doc.firstChild?.firstChild?.marks ?? [];
    expect(marks.map((m) => [m.type.name, m.attrs.color])).toEqual([['color', '#8e4ec6']]);
  });
});
