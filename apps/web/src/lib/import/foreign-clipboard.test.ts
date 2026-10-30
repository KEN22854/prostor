import { describe, expect, it } from 'vitest';
import type { ShapeElement, StickyElement, TableElement, TextElement } from '@prostor/shared';
import { zSequence } from './common';
import {
  decodeMiro,
  encodeMiro,
  htmlToText,
  importForeignClipboard,
  parseColor,
} from './foreign-clipboard';

const ctx = () => ({ userId: 'u1', z: zSequence(null) });

const miroWidget = (type: string, json: Record<string, unknown>) => ({
  widgetData: { type, json },
  type: 14,
  id: 0,
});

describe('буфер других досок', () => {
  it('Miro: декодирование туда-обратно, включая кириллицу', () => {
    const data = { data: { objects: [{ text: 'Привет' }] } };
    expect(decodeMiro(encodeMiro(data))).toEqual(data);
  });

  it('Miro: стикер, фигура, текст и линия', async () => {
    const html = encodeMiro({
      boardId: 'x',
      data: {
        objects: [
          miroWidget('sticker', {
            _position: { offsetPx: { x: 100, y: 100 } },
            size: { width: 200, height: 200 },
            scale: { scale: 1 },
            text: '<p>Идея</p><p>вторая строка</p>',
            style: JSON.stringify({ sbc: '#ffcee0', fs: 24 }),
          }),
          miroWidget('shape', {
            _position: { offsetPx: { x: 500, y: 100 } },
            size: { width: 100, height: 50 },
            scale: { scale: 2 },
            shape: 'circle',
            text: 'Круг &amp; текст',
            style: JSON.stringify({ bc: 16711680, brc: '#000000' }),
          }),
          miroWidget('text', {
            _position: { offsetPx: { x: 100, y: 400 } },
            size: { width: 300, height: 40 },
            text: '<p>Заголовок</p>',
          }),
          miroWidget('line', {
            primary: { point: { x: 0, y: 0 } },
            secondary: { point: { x: 100, y: 50 } },
            style: JSON.stringify({ lc: '#2d9bf0', a_start: 0, a_end: 1 }),
          }),
          miroWidget('image', { _position: { offsetPx: { x: 0, y: 0 } } }),
        ],
      },
    });
    const result = await importForeignClipboard({ html, text: 'Идея' }, ctx());
    expect(result?.skipped).toBe(1);
    const [sticky, shape, text, line] = result!.elements;
    expect(sticky).toMatchObject({
      type: 'sticky',
      x: 0,
      y: 0,
      width: 200,
      fill: '#ffcee0',
      fontSize: 24,
      text: 'Идея\nвторая строка',
    } satisfies Partial<StickyElement>);
    expect(shape).toMatchObject({
      type: 'shape',
      shape: 'ellipse',
      x: 400,
      width: 200,
      height: 100,
      fill: '#ff0000',
      text: 'Круг & текст',
    } satisfies Partial<ShapeElement>);
    expect(text).toMatchObject({ type: 'text', text: 'Заголовок' } satisfies Partial<TextElement>);
    expect(line).toMatchObject({ type: 'arrow', points: [0, 0, 100, 50], stroke: '#2d9bf0' });
  });

  it('Excalidraw: JSON из буфера', async () => {
    const text = JSON.stringify({
      type: 'excalidraw/clipboard',
      elements: [{ id: 'a', type: 'rectangle', x: 0, y: 0, width: 100, height: 60 }],
    });
    const result = await importForeignClipboard({ html: '', text }, ctx());
    expect(result?.elements[0]).toMatchObject({ type: 'shape', shape: 'rect', width: 100 });
  });

  it('незнакомая доска: объекты с координатами в data-атрибуте (в т.ч. base64)', async () => {
    const payload = {
      version: 3,
      items: [
        {
          type: 'note',
          position: { x: 10, y: 20 },
          size: { width: 180, height: 180 },
          content: '<b>Стикер</b>',
          color: 'rgb(255, 230, 100)',
        },
        { type: 'ellipse', x: 300, y: 20, width: 80, height: 80, fill: '#abc' },
        { type: 'text', left: 0, top: 300, w: 200, h: 30, text: 'Подпись' },
      ],
    };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const html = `<div data-board-clipboard="${b64}">Стикер</div>`;
    const result = await importForeignClipboard({ html, text: 'Стикер' }, ctx());
    expect(result?.elements.map((e) => e.type)).toEqual(['sticky', 'shape', 'text']);
    expect(result?.elements[0]).toMatchObject({ text: 'Стикер', fill: '#ffe664', x: 10, y: 20 });
    expect(result?.elements[1]).toMatchObject({ shape: 'ellipse', fill: '#aabbcc' });
    expect(result?.elements[2]).toMatchObject({ text: 'Подпись', x: 0, y: 300 });
  });

  it('HTML-таблица становится таблицей доски', async () => {
    const html =
      '<table><tr><th>Задача</th><th>Срок</th></tr><tr><td>Макет</td><td>пт</td></tr></table>';
    const result = await importForeignClipboard({ html, text: 'Задача\tСрок' }, ctx());
    const table = result?.elements[0] as TableElement;
    expect(table).toMatchObject({ type: 'table', rows: 2, cols: 2 });
    expect(table.cells).toEqual([
      ['Задача', 'Срок'],
      ['Макет', 'пт'],
    ]);
  });

  it('обычный текст и HTML без объектов — не наш случай', async () => {
    expect(await importForeignClipboard({ html: '<p>Просто текст</p>', text: 'x' }, ctx())).toBe(
      null,
    );
    expect(await importForeignClipboard({ html: '', text: '{"a": 1}' }, ctx())).toBe(null);
  });

  it('цвета и HTML-текст', () => {
    expect(parseColor(0xfff9b1)).toBe('#fff9b1');
    expect(parseColor('#FA0')).toBe('#ffaa00');
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toBe('#010203');
    expect(parseColor('red')).toBeUndefined();
    expect(htmlToText('<p>a<br>b</p><ul><li>c</li></ul>')).toBe('a\nb\nc');
  });
});
