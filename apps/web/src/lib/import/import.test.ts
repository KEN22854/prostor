import { describe, expect, it } from 'vitest';
import type { LineElement, ShapeElement } from '@prostor/shared';
import { placeAt, zSequence } from './common';
import { importExcalidraw, isExcalidraw } from './excalidraw';
import { importMermaid, layerNodes, parseMermaid } from './mermaid';
import { importStickies, parseStickyList } from './stickies';

const ctx = { userId: 'u1', z: zSequence(null) };

describe('Mermaid', () => {
  const source = `flowchart TD
    A([Старт]) --> B{Есть доступ?}
    B -->|да| C[Открыть доску]
    B -- нет --> D[(Запрос)]
    D -.-> A
    C --> E & F`;

  it('узлы, формы, подписи и цепочки связей', () => {
    const g = parseMermaid(source)!;
    expect(g.direction).toBe('TB');
    expect(g.nodes.find((n) => n.id === 'A')).toMatchObject({ label: 'Старт', shape: 'pill' });
    expect(g.nodes.find((n) => n.id === 'B')?.shape).toBe('diamond');
    expect(g.nodes.find((n) => n.id === 'D')?.shape).toBe('cylinder');
    expect(g.edges.find((e) => e.from === 'B' && e.to === 'C')?.label).toBe('да');
    expect(g.edges.find((e) => e.from === 'B' && e.to === 'D')?.label).toBe('нет');
    expect(g.edges.find((e) => e.from === 'D')?.dashed).toBe(true);
    expect(g.edges.filter((e) => e.from === 'C').map((e) => e.to)).toEqual(['E', 'F']);
  });

  it('слои по длиннейшему пути, цикл не мешает', () => {
    const layers = layerNodes(parseMermaid(source)!);
    expect(layers.get('A')).toBe(0);
    expect(layers.get('B')).toBe(1);
    expect(layers.get('E')).toBe(3);
  });

  it('импорт: фигуры с текстом и привязанные стрелки', () => {
    const result = importMermaid(source, ctx)!;
    const shapes = result.elements.filter((e) => e.type === 'shape') as ShapeElement[];
    const arrows = result.elements.filter((e) => e.type === 'arrow') as LineElement[];
    expect(shapes).toHaveLength(6);
    expect(shapes.map((s) => s.text)).toContain('Открыть доску');
    expect(arrows).toHaveLength(6);
    expect(arrows.every((a) => a.startBinding && a.endBinding)).toBe(true);
    expect(importMermaid('просто текст', ctx)).toBeNull();
  });
});

describe('Excalidraw', () => {
  const file = {
    type: 'excalidraw',
    elements: [
      {
        id: 'r',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        backgroundColor: '#a5d8ff',
        strokeColor: '#1e1e1e',
        roundness: { type: 3 },
      },
      {
        id: 't',
        type: 'text',
        x: 10,
        y: 10,
        width: 80,
        height: 20,
        text: 'Привет',
        containerId: 'r',
        fontSize: 20,
        strokeColor: '#1e1e1e',
      },
      {
        id: 'e',
        type: 'ellipse',
        x: 300,
        y: 0,
        width: 80,
        height: 80,
        backgroundColor: 'transparent',
      },
      {
        id: 'a',
        type: 'arrow',
        x: 100,
        y: 25,
        width: 200,
        height: 15,
        points: [
          [0, 0],
          [200, 15],
        ],
        startBinding: { elementId: 'r' },
        endBinding: { elementId: 'e' },
        endArrowhead: 'arrow',
      },
      { id: 'img', type: 'image', x: 0, y: 200, width: 10, height: 10 },
      { id: 'gone', type: 'rectangle', x: 0, y: 0, width: 1, height: 1, isDeleted: true },
    ],
  };

  it('фигуры, подпись внутри фигуры, стрелка с привязками; картинки пропускаются', () => {
    expect(isExcalidraw(file)).toBe(true);
    const { elements, skipped } = importExcalidraw(file, ctx);
    expect(skipped).toBe(1);
    const rect = elements.find(
      (e) => e.type === 'shape' && (e as ShapeElement).shape === 'roundRect',
    ) as ShapeElement;
    expect(rect.text).toBe('Привет');
    expect(rect.fill).toBe('#a5d8ff');
    const arrow = elements.find((e) => e.type === 'arrow') as LineElement;
    expect(arrow.startBinding?.elementId).toBe(rect.id);
    expect(arrow.endArrow).toBe('arrow');
    expect(elements.some((e) => e.type === 'text')).toBe(false);
  });
});

describe('Стикеры из списка и Miro CSV', () => {
  it('CSV с заголовком Content/Color', () => {
    const list = parseStickyList('Content,Color\n"Идея, большая",light_green\nВторая,yellow');
    expect(list).toEqual([
      { text: 'Идея, большая', color: '#bbf7d0' },
      { text: 'Вторая', color: '#fef08a' },
    ]);
  });

  it('просто строки и маркированный список — стикеры сеткой', () => {
    const result = importStickies('- раз\n- два\n3. три\n\nчетыре', ctx)!;
    expect(result.elements).toHaveLength(4);
    const placed = placeAt(result.elements, { x: 0, y: 0 });
    const xs = placed.map((e) => e.x);
    expect(Math.min(...xs) + Math.max(...xs) + 200).toBeCloseTo(0);
  });
});
