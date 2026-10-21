import { describe, expect, it } from 'vitest';
import { buildFrame, buildLine, buildSticky } from '@/lib/canvas/element-factory';
import { elementsToSvg, escapeXml, smoothPath } from './svg';
import { clampLines, layoutText, wrapText } from './text-layout';

/** Моноширинная «метрика»: 10 px на символ */
const mono = (t: string) => t.length * 10;

describe('wrapText / layoutText', () => {
  it('переносит по словам, длинное слово режет', () => {
    expect(wrapText('один два три', 80, mono)).toEqual(['один два', 'три']);
    expect(wrapText('оченьдлинноеслово', 50, mono)).toEqual(['очень', 'длинн', 'оесло', 'во']);
    expect(wrapText('a\n\nb', 100, mono)).toEqual(['a', '', 'b']);
  });

  it('многоточие на последней строке при нехватке высоты', () => {
    expect(clampLines(['aaaa', 'bbbb', 'cccc'], 2, 40, mono)).toEqual(['aaaa', 'bbb…']);
  });

  it('вертикальное и горизонтальное выравнивание как у Konva (lineHeight = 1)', () => {
    const { lines, anchor } = layoutText(
      {
        text: 'ab cd',
        width: 20,
        height: 100,
        fontSize: 20,
        align: 'center',
        verticalAlign: 'middle',
        ellipsis: false,
      },
      mono,
    );
    expect(anchor).toBe('middle');
    expect(lines.map((l) => l.text)).toEqual(['ab', 'cd']);
    expect(lines[0]).toMatchObject({ x: 10, y: 40 });
    expect(lines[1]).toMatchObject({ y: 60 });
  });
});

describe('elementsToSvg', () => {
  const opts = {
    bounds: { minX: -50, minY: -50, maxX: 1000, maxY: 800 },
    background: '#ffffff',
    images: new Map<string, string>(),
    measure: (t: string) => mono(t),
  };

  it('фрейм — отдельный слой со своим содержимым, остальное — слой «Доска»', () => {
    const frame = {
      ...buildFrame({
        x: 0,
        y: 0,
        width: 600,
        height: 400,
        title: 'Идеи <&>',
        userId: 'u',
        zIndex: 'a0',
      }),
      id: 'f1',
    };
    const inFrame = {
      ...buildSticky({ x: 10, y: 10, fill: '#fde68a', text: 'Внутри', userId: 'u', zIndex: 'a1' }),
      id: 's1',
      frameId: 'f1',
    };
    const loose = {
      ...buildSticky({
        x: 700,
        y: 10,
        fill: '#bbf7d0',
        text: 'Снаружи',
        userId: 'u',
        zIndex: 'a2',
      }),
      id: 's2',
    };
    const svg = elementsToSvg([loose, inFrame, frame], opts);
    expect(svg).toContain('inkscape:groupmode="layer" inkscape:label="Идеи &lt;&amp;&gt;"');
    expect(svg).toContain('inkscape:label="Доска"');
    expect(svg.indexOf('id="el-s1"')).toBeGreaterThan(svg.indexOf('id="frame-f1"'));
    expect(svg.indexOf('id="el-s1"')).toBeLessThan(svg.indexOf('id="board"'));
    expect(svg).toContain('viewBox="-50 -50 1050 850"');
    expect(svg).toContain('>Внутри</tspan>');
  });

  it('стрелка получает наконечник', () => {
    const arrow = {
      ...buildLine({
        type: 'arrow',
        x: 0,
        y: 0,
        dx: 100,
        dy: 0,
        stroke: '#111',
        strokeWidth: 2,
        userId: 'u',
        zIndex: 'a0',
      }),
      id: 'a',
    };
    const svg = elementsToSvg([arrow], opts);
    expect(svg).toContain('<polyline points="0,0 100,0"');
    expect(svg).toMatch(/<polygon points="100,0 92,/);
  });

  it('сглаживание повторяет структуру Konva: Q … C … Q', () => {
    const d = smoothPath([0, 0, 10, 10, 20, 0, 30, 10]);
    expect(d.startsWith('M0 0 Q')).toBe(true);
    expect(d).toContain(' C');
    expect(d.endsWith('30 10')).toBe(true);
    expect(smoothPath([0, 0, 5, 5])).toBe('M0 0 L5 5');
  });

  it('экранирование XML', () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;',
    );
  });
});

describe('elementsToSvg: форматированный текст', () => {
  it('жирный и подчёркнутый фрагменты, маркер списка', () => {
    const el = {
      ...buildSticky({ x: 0, y: 0, fill: '#fde68a', text: 'x', userId: 'u', zIndex: 'a0' }),
      id: 'r',
      rich: [
        {
          bullet: true,
          runs: [
            { text: 'важно', bold: true },
            { text: ' ссылка', underline: true },
          ],
        },
      ],
    };
    const svg = elementsToSvg([el], {
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 300 },
      background: null,
      images: new Map(),
      measure: (t: string) => t.length * 10,
    });
    expect(svg).toContain('>•</text>');
    expect(svg).toMatch(/font-weight="bold"[^>]*>важно<\/text>/);
    expect(svg).toMatch(/text-decoration="underline"[^>]*> ссылка<\/text>/);
  });
});
