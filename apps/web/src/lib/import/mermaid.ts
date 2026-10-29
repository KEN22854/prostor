import type { BoardElement, LineElement, ShapeElement } from '@prostor/shared';
import { buildLine, buildShape } from '@/lib/canvas/element-factory';
import type { ImportContext, ImportResult } from '@/lib/import/common';

/**
 * Mermaid-блок-схема (flowchart / graph) → фигуры и стрелки доски с
 * автоматической раскладкой по слоям. Поддерживаются формы узлов
 * [прямоугольник], (скруглённый), ([капсула]), {ромб}, ((круг)), [(БД)],
 * {{шестиугольник}}, [/данные/], >флажок], и стрелки -->, ---, -.->, ==>,
 * с подписями -->|текст| и -- текст -->.
 */
export interface MermaidNode {
  id: string;
  label: string;
  shape: ShapeElement['shape'];
}
export interface MermaidEdge {
  from: string;
  to: string;
  label?: string;
  arrow: boolean;
  dashed: boolean;
}
export interface MermaidGraph {
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  nodes: MermaidNode[];
  edges: MermaidEdge[];
}

const NODE_FORMS: Array<{ open: string; close: string; shape: ShapeElement['shape'] }> = [
  { open: '((', close: '))', shape: 'ellipse' },
  { open: '([', close: '])', shape: 'pill' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[/', close: '/]', shape: 'parallelogram' },
  { open: '[\\', close: '\\]', shape: 'parallelogram' },
  { open: '[[', close: ']]', shape: 'rect' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'roundRect' },
  { open: '{', close: '}', shape: 'diamond' },
  { open: '>', close: ']', shape: 'callout' },
];

const unquote = (s: string) =>
  s
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/<br\s*\/?>/gi, '\n');

/** «A[Текст]» → узел; «A» — ссылка на уже объявленный */
function parseNode(raw: string, nodes: Map<string, MermaidNode>): string | null {
  const text = raw.trim().replace(/:::\w+$/, '');
  const m = /^([A-Za-zА-Яа-яЁё0-9_.-]+)(.*)$/.exec(text);
  if (!m) return null;
  const id = m[1]!;
  const rest = m[2]!.trim();
  let node = nodes.get(id);
  if (rest) {
    const form = NODE_FORMS.find((f) => rest.startsWith(f.open) && rest.endsWith(f.close));
    const label = form ? unquote(rest.slice(form.open.length, -form.close.length)) : unquote(rest);
    node = { id, label: label || id, shape: form?.shape ?? 'rect' };
    nodes.set(id, node);
  } else if (!node) {
    node = { id, label: id, shape: 'rect' };
    nodes.set(id, node);
  }
  return id;
}

// Связь: --> --- -.-> ==> -->|текст| -- текст -->
const EDGE =
  /\s*(<?)(-->|---|-\.->|-\.-|==>|===|--\s+[^-]+?\s+-->|--\s+[^-]+?\s+---)\s*(?:\|([^|]*)\|)?\s*/;

export function parseMermaid(source: string): MermaidGraph | null {
  const lines = source
    .replace(/%%.*$/gm, '')
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = /^(flowchart|graph)\s*(TB|TD|BT|LR|RL)?/i.exec(lines[0] ?? '');
  if (!header) return null;
  const dir = (header[2] ?? 'TB').toUpperCase();
  const direction = (dir === 'TD' ? 'TB' : dir) as MermaidGraph['direction'];
  const nodes = new Map<string, MermaidNode>();
  const edges: MermaidEdge[] = [];

  for (const line of lines.slice(1)) {
    if (/^(subgraph|end|style|classDef|class|linkStyle|click|direction)\b/i.test(line)) continue;
    // Цепочка «A --> B --> C»: режем по связям, сохраняя их
    const parts: string[] = [];
    const links: Array<{ token: string; label?: string }> = [];
    let rest = line;
    for (;;) {
      const m = EDGE.exec(rest);
      if (!m || m.index === undefined) break;
      parts.push(rest.slice(0, m.index));
      const token = m[2]!;
      const inline = /^--\s+(.+?)\s+--[->]$/.exec(token);
      links.push({ token, label: m[3]?.trim() || inline?.[1]?.trim() });
      rest = rest.slice(m.index + m[0].length);
    }
    parts.push(rest);
    // «A & B --> C» — несколько узлов на конце связи
    const groups = parts.map((p) =>
      p
        .split('&')
        .map((n) => parseNode(n, nodes))
        .filter((id): id is string => id !== null),
    );
    links.forEach((link, i) => {
      for (const from of groups[i] ?? [])
        for (const to of groups[i + 1] ?? [])
          edges.push({
            from,
            to,
            label: link.label ? unquote(link.label) : undefined,
            arrow: link.token.endsWith('>'),
            dashed: link.token.includes('.'),
          });
    });
  }
  if (nodes.size === 0) return null;
  return { direction, nodes: [...nodes.values()], edges };
}

/** Слои: длиннейший путь от корней (циклы разрываются обходом в глубину) */
export function layerNodes(graph: MermaidGraph): Map<string, number> {
  const out = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of graph.nodes) {
    out.set(n.id, []);
    indegree.set(n.id, 0);
  }
  // Убираем обратные рёбра (циклы), иначе слои не определены
  const state = new Map<string, 0 | 1 | 2>();
  const forward: MermaidEdge[] = [];
  const adj = new Map<string, MermaidEdge[]>();
  for (const e of graph.edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e]);
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of adj.get(id) ?? []) {
      const s = state.get(e.to) ?? 0;
      if (s === 1) continue;
      forward.push(e);
      if (s === 0) visit(e.to);
    }
    state.set(id, 2);
  };
  for (const n of graph.nodes) if (!state.get(n.id)) visit(n.id);
  for (const e of forward) {
    out.get(e.from)?.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }
  const layer = new Map<string, number>();
  const queue = graph.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of queue) layer.set(id, 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const to of out.get(id) ?? []) {
      layer.set(to, Math.max(layer.get(to) ?? 0, (layer.get(id) ?? 0) + 1));
      indegree.set(to, (indegree.get(to) ?? 1) - 1);
      if (indegree.get(to) === 0) queue.push(to);
    }
  }
  for (const n of graph.nodes) if (!layer.has(n.id)) layer.set(n.id, 0);
  return layer;
}

const FILLS: Partial<Record<ShapeElement['shape'], string>> = {
  diamond: '#fde68a',
  pill: '#ddd6fe',
  cylinder: '#bbf7d0',
  parallelogram: '#bfdbfe',
  hexagon: '#fed7aa',
  ellipse: '#fbcfe8',
};

export function importMermaid(source: string, ctx: ImportContext): ImportResult | null {
  const graph = parseMermaid(source);
  if (!graph) return null;
  const layers = layerNodes(graph);
  const horizontal = graph.direction === 'LR' || graph.direction === 'RL';
  const reverse = graph.direction === 'BT' || graph.direction === 'RL';
  const W = 180;
  const H = 80;
  const GAP_MAIN = horizontal ? 110 : 90;
  const GAP_CROSS = 50;

  const byLayer = new Map<number, MermaidNode[]>();
  for (const n of graph.nodes) {
    const l = layers.get(n.id) ?? 0;
    byLayer.set(l, [...(byLayer.get(l) ?? []), n]);
  }
  const maxLayer = Math.max(...byLayer.keys());
  const widest = Math.max(...[...byLayer.values()].map((ns) => ns.length));
  const elements: BoardElement[] = [];
  const ids = new Map<string, ShapeElement>();

  for (const [l, ns] of byLayer) {
    const main = (reverse ? maxLayer - l : l) * ((horizontal ? W : H) + GAP_MAIN);
    // Слой центрируется относительно самого широкого
    const offset = ((widest - ns.length) * ((horizontal ? H : W) + GAP_CROSS)) / 2;
    ns.forEach((n, i) => {
      const cross = offset + i * ((horizontal ? H : W) + GAP_CROSS);
      const size =
        n.shape === 'diamond'
          ? { w: W, h: H + 30 }
          : n.shape === 'ellipse'
            ? { w: 110, h: 110 }
            : { w: W, h: H };
      const x = horizontal ? main : cross + (W - size.w) / 2;
      const y = horizontal ? cross + (H - size.h) / 2 : main + (H - size.h) / 2;
      const shape = buildShape({
        x,
        y,
        width: size.w,
        height: size.h,
        shape: n.shape,
        fill: FILLS[n.shape] ?? '#ffffff',
        stroke: '#1f2937',
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      const withText: ShapeElement = { ...shape, text: n.label };
      ids.set(n.id, withText);
      elements.push(withText);
    });
  }

  for (const e of graph.edges) {
    const a = ids.get(e.from);
    const b = ids.get(e.to);
    if (!a || !b) continue;
    const ax = a.x + a.width / 2;
    const ay = a.y + a.height / 2;
    const line: LineElement = buildLine({
      x: ax,
      y: ay,
      type: e.arrow ? 'arrow' : 'line',
      dx: b.x + b.width / 2 - ax,
      dy: b.y + b.height / 2 - ay,
      stroke: '#475569',
      strokeWidth: 2,
      // Привязки: при создании стрелка «сядет» на границы фигур и будет следовать за ними
      startBinding: { elementId: a.id, anchor: 'auto' },
      endBinding: { elementId: b.id, anchor: 'auto' },
      userId: ctx.userId,
      zIndex: ctx.z(),
    });
    elements.push({
      ...line,
      ...(e.dashed ? { dash: [8, 6] } : {}),
      ...(e.label ? { label: e.label } : {}),
    });
  }
  return { elements, skipped: 0 };
}
