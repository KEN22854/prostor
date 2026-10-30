import { TABLE_LIMITS, type BoardElement, type ShapeElement } from '@prostor/shared';
import {
  buildLine,
  buildShape,
  buildSticky,
  buildTable,
  buildText,
} from '@/lib/canvas/element-factory';
import {
  cornerForCenterRotation,
  lineGeometry,
  type ImportContext,
  type ImportResult,
} from '@/lib/import/common';
import { STICKY_COLORS } from '@/stores/canvas-store';

/**
 * Вставка объектов, скопированных на других досках (Miro, Excalidraw, draw.io,
 * Holst и прочих). У каждой доски свой формат буфера, поэтому:
 *  1. известные форматы разбираются точно (Miro — закодированный JSON в HTML,
 *     Excalidraw — JSON в тексте, draw.io — mxGraphModel);
 *  2. неизвестные — эвристикой: в JSON буфера (в тексте или data-атрибутах HTML)
 *     ищутся объекты с координатами и размерами — так устроены почти все доски;
 *  3. HTML-таблица (Google Таблицы, Excel, доски) становится таблицей доски.
 * Всё, что не распознано, вставляется как раньше: картинкой или текстом.
 */
export interface ClipboardSource {
  html: string;
  text: string;
}

const MAX_ITEMS = 2000;

export async function importForeignClipboard(
  src: ClipboardSource,
  ctx: ImportContext,
): Promise<ImportResult | null> {
  const miro = decodeMiro(src.html);
  if (miro) {
    const result = importMiro(miro, ctx);
    if (result.elements.length > 0) return result;
  }

  const textJson = parseJson(src.text.trim());
  if (textJson !== undefined) {
    const { importExcalidraw, isExcalidraw } = await import('@/lib/import/excalidraw');
    if (isExcalidraw(textJson)) return importExcalidraw(textJson, ctx);
  }

  const drawio = drawioXml(src.text) ?? drawioXml(src.html);
  if (drawio) {
    const result = await (await import('@/lib/import/drawio')).importDrawio(drawio, ctx);
    if (result && result.elements.length > 0) return result;
  }

  for (const json of [textJson, ...embeddedJson(src.html)]) {
    if (json === undefined) continue;
    const result = importGeneric(json, ctx);
    if (result.elements.length > 0) return result;
  }

  const table = htmlTable(src.html, ctx);
  if (table) return { elements: [table], skipped: 0 };
  return null;
}

// ---------- Miro ----------

const MIRO_RE = /\(miro-data-v\d+\)([\s\S]*?)\(\/miro-data-v\d+\)/;
/** Miro сдвигает каждый байт JSON на 59 перед base64 */
const MIRO_OFFSET = 59;

export function decodeMiro(html: string): unknown {
  const m = MIRO_RE.exec(html);
  if (!m?.[1]) return undefined;
  try {
    const bin = atob(m[1].trim());
    const bytes = Uint8Array.from(bin, (c) => (c.charCodeAt(0) - MIRO_OFFSET + 256) % 256);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

/** Для тестов: кодирование, как это делает Miro */
export function encodeMiro(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const bin = Array.from(bytes, (b) => String.fromCharCode((b + MIRO_OFFSET) % 256)).join('');
  return `<span data-meta="<--(miro-data-v1)${btoa(bin)}(/miro-data-v1)-->"></span>`;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Стиль виджета Miro — JSON-строка с короткими ключами */
function miroStyle(raw: unknown): Obj {
  if (isObj(raw)) return raw;
  if (typeof raw !== 'string') return {};
  const parsed = parseJson(raw);
  return isObj(parsed) ? parsed : {};
}

function importMiro(data: unknown, ctx: ImportContext): ImportResult {
  const objects = isObj(data) && isObj(data.data) ? data.data.objects : undefined;
  if (!Array.isArray(objects)) return { elements: [], skipped: 0 };
  const out: BoardElement[] = [];
  let skipped = 0;
  for (const o of objects.slice(0, MAX_ITEMS)) {
    const wd = isObj(o) && isObj(o.widgetData) ? o.widgetData : undefined;
    const json = wd && isObj(wd.json) ? wd.json : undefined;
    if (!wd || !json) {
      skipped++;
      continue;
    }
    const type = String(wd.type ?? '').toLowerCase();
    const style = miroStyle(json.style);

    if (type === 'line' || type === 'connector') {
      const a = miroPoint(json.primary);
      const b = miroPoint(json.secondary);
      if (!a || !b) {
        skipped++;
        continue;
      }
      const end = num(style.a_end) ?? 1;
      const start = num(style.a_start) ?? 0;
      const line = buildLine({
        x: a.x,
        y: a.y,
        type: end ? 'arrow' : 'line',
        dx: b.x - a.x,
        dy: b.y - a.y,
        stroke: parseColor(style.lc) ?? '#1f2937',
        strokeWidth: clamp(num(style.t) ?? num(style.lt) ?? 2, 1, 40),
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      out.push({ ...line, startArrow: start ? 'arrow' : 'none', endArrow: end ? 'arrow' : 'none' });
      continue;
    }

    const pos = (
      isObj(json._position) && isObj(json._position.offsetPx)
        ? json._position.offsetPx
        : json.position
    ) as Obj | undefined;
    const size = isObj(json.size) ? json.size : {};
    const scale = (isObj(json.scale) ? num(json.scale.scale) : num(json.scale)) ?? 1;
    const w = (num(size.width) ?? 200) * scale;
    const h = (num(size.height) ?? (type === 'text' ? 40 : 200)) * scale;
    const cx = num(pos?.x);
    const cy = num(pos?.y);
    if (cx === undefined || cy === undefined) {
      skipped++;
      continue;
    }
    const rotation = (isObj(json.rotation) ? num(json.rotation.rotation) : num(json.rotation)) ?? 0;
    // В Miro позиция — центр виджета
    const corner = cornerForCenterRotation(
      cx - w / 2,
      cy - h / 2,
      w,
      h,
      (rotation * Math.PI) / 180,
    );
    const text = htmlToText(String(json.text ?? json.content ?? ''));
    const fontSize = num(style.fs) !== undefined ? num(style.fs)! * scale : undefined;
    const textColor = parseColor(style.tc);
    const align = miroAlign(style.ta);
    const item: Item = {
      x: corner.x,
      y: corner.y,
      w,
      h,
      rotation,
      text,
      fontSize,
      textColor,
      align,
      fill: undefined,
      stroke: parseColor(style.brc),
      kind: 'shape',
      shape: 'rect',
    };
    if (type === 'sticker' || type === 'sticky' || type === 'card') {
      item.kind = 'sticky';
      item.fill = parseColor(style.sbc) ?? parseColor(style.bc);
    } else if (type === 'text') {
      item.kind = 'text';
    } else if (type === 'shape') {
      item.fill = parseColor(style.bc) ?? 'transparent';
      item.shape = shapeFromName(String(json.shape ?? style.st ?? ''));
    } else if (type === 'frame') {
      item.kind = 'shape';
      item.fill = parseColor(style.bc) ?? '#ffffff';
    } else {
      skipped++;
      continue;
    }
    out.push(buildItem(item, ctx));
  }
  return { elements: out, skipped };
}

function miroPoint(raw: unknown): { x: number; y: number } | null {
  const p = isObj(raw) && isObj(raw.point) ? raw.point : raw;
  if (!isObj(p)) return null;
  const x = num(p.x);
  const y = num(p.y);
  return x === undefined || y === undefined ? null : { x, y };
}

function miroAlign(v: unknown): 'left' | 'center' | 'right' | undefined {
  if (v === 'l' || v === 'left') return 'left';
  if (v === 'c' || v === 'center') return 'center';
  if (v === 'r' || v === 'right') return 'right';
  return undefined;
}

// ---------- draw.io ----------

function drawioXml(s: string): string | null {
  if (!s) return null;
  let v = s.trim();
  if (/^%3C/i.test(v)) {
    try {
      v = decodeURIComponent(v);
    } catch {
      return null;
    }
  }
  const m = /<mxGraphModel[\s\S]*<\/mxGraphModel>|<mxfile[\s\S]*<\/mxfile>/.exec(v);
  return m ? m[0] : null;
}

// ---------- Универсальная эвристика ----------

interface Item {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  text: string;
  fontSize?: number;
  textColor?: string;
  align?: 'left' | 'center' | 'right';
  fill?: string;
  stroke?: string;
  kind: 'sticky' | 'text' | 'shape';
  shape: ShapeElement['shape'];
}

/** JSON из HTML: data-атрибуты и <script type="application/json"> (в т.ч. в base64) */
export function embeddedJson(html: string): unknown[] {
  if (!html) return [];
  const found: unknown[] = [];
  const candidates: string[] = [];
  for (const m of html.matchAll(/\sdata-[\w-]+\s*=\s*("([^"]*)"|'([^']*)')/g))
    candidates.push(decodeEntities(m[2] ?? m[3] ?? ''));
  for (const m of html.matchAll(
    /<script[^>]*type=["']?application\/(?:ld\+)?json[^>]*>([\s\S]*?)<\/script>/gi,
  ))
    candidates.push(m[1] ?? '');
  // Комментарии вида <!--(meta)…(/meta)--> — так кладут данные некоторые доски
  for (const m of html.matchAll(/<!--\s*\(([\w-]+)\)([\s\S]*?)\(\/\1\)\s*-->/g))
    candidates.push(m[2] ?? '');
  for (const raw of candidates) {
    const s = raw.trim();
    if (s.length < 2) continue;
    const direct = parseJson(s);
    if (direct !== undefined && typeof direct === 'object') {
      found.push(direct);
      continue;
    }
    if (/^[A-Za-z0-9+/=\s_-]{16,}$/.test(s)) {
      try {
        const bin = atob(s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        const decoded = parseJson(new TextDecoder().decode(bytes));
        if (decoded !== undefined && typeof decoded === 'object') found.push(decoded);
      } catch {
        // не base64 — пропускаем
      }
    }
  }
  return found;
}

const TEXT_KEYS = ['text', 'content', 'title', 'label', 'value', 'caption', 'name'];
const FILL_KEYS = ['fill', 'backgroundColor', 'background', 'bgColor', 'fillColor', 'color'];

/** Числа геометрии объекта в любом из распространённых видов */
function geometry(o: Obj): { x: number; y: number; w: number; h: number } | null {
  const pos = isObj(o.position) ? o.position : isObj(o.pos) ? o.pos : o;
  const size = isObj(o.size) ? o.size : isObj(o.geometry) ? o.geometry : o;
  const x = num(pos.x) ?? num(pos.left) ?? num(o.left);
  const y = num(pos.y) ?? num(pos.top) ?? num(o.top);
  const w = num(size.width) ?? num(size.w) ?? num(o.width) ?? num(o.w);
  const h = num(size.height) ?? num(size.h) ?? num(o.height) ?? num(o.h);
  if (x === undefined || y === undefined || w === undefined || h === undefined) return null;
  if (w <= 0 || h <= 0 || w > 100_000 || h > 100_000) return null;
  return { x, y, w, h };
}

function textOf(o: Obj): string {
  for (const key of TEXT_KEYS) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return htmlToText(v);
    if (isObj(v)) {
      const inner = textOf(v);
      if (inner) return inner;
    }
    // Rich-текст в виде массива абзацев/кусков
    if (Array.isArray(v)) {
      const parts = v
        .map((p) => (typeof p === 'string' ? p : isObj(p) ? textOf(p) : ''))
        .filter(Boolean);
      if (parts.length > 0) return parts.join('\n');
    }
  }
  return '';
}

function fillOf(o: Obj): string | undefined {
  const style = isObj(o.style) ? o.style : {};
  for (const key of FILL_KEYS) {
    const c = parseColor(o[key]) ?? parseColor(style[key]);
    if (c) return c;
  }
  return undefined;
}

function collect(node: unknown, items: Obj[], depth: number): void {
  if (items.length >= MAX_ITEMS || depth > 10) return;
  if (Array.isArray(node)) {
    for (const v of node) collect(v, items, depth + 1);
    return;
  }
  if (!isObj(node)) return;
  // Объект с геометрией — элемент доски; его детей не обходим (координаты у них свои)
  if (geometry(node)) {
    items.push(node);
    return;
  }
  for (const v of Object.values(node)) collect(v, items, depth + 1);
}

export function importGeneric(json: unknown, ctx: ImportContext): ImportResult {
  const raw: Obj[] = [];
  collect(json, raw, 0);
  const out: BoardElement[] = [];
  let skipped = 0;
  for (const o of raw) {
    const g = geometry(o)!;
    const type = String(o.type ?? o.kind ?? o.widgetType ?? o.shape ?? '').toLowerCase();
    if (/image|picture|img|video|file/.test(type)) {
      skipped++;
      continue;
    }
    if (/line|arrow|connector|edge/.test(type)) {
      const pts = Array.isArray(o.points) ? o.points : null;
      const pairs: Array<[number, number]> = [];
      for (const p of pts ?? []) {
        if (Array.isArray(p) && num(p[0]) !== undefined && num(p[1]) !== undefined)
          pairs.push([p[0] as number, p[1] as number]);
        else if (isObj(p) && num(p.x) !== undefined && num(p.y) !== undefined)
          pairs.push([p.x as number, p.y as number]);
      }
      if (pairs.length < 2) {
        skipped++;
        continue;
      }
      const base = buildLine({
        x: g.x,
        y: g.y,
        type: /arrow/.test(type) ? 'arrow' : 'line',
        dx: 0,
        dy: 0,
        stroke: parseColor(o.stroke) ?? parseColor(o.color) ?? '#1f2937',
        strokeWidth: clamp(num(o.strokeWidth) ?? 2, 1, 40),
        userId: ctx.userId,
        zIndex: ctx.z(),
      });
      out.push({ ...base, ...lineGeometry(pairs) });
      continue;
    }
    const text = textOf(o);
    const fill = fillOf(o);
    const rotation = num(o.rotation) ?? num(o.angle) ?? 0;
    let kind: Item['kind'] = 'shape';
    if (/stick|note|card|стикер|заметк/.test(type)) kind = 'sticky';
    else if (/text|label|title|heading/.test(type)) kind = 'text';
    else if (!type || /widget|item|element|node|object/.test(type))
      kind = fill && text ? 'sticky' : text ? 'text' : 'shape';
    out.push(
      buildItem(
        {
          ...g,
          rotation,
          text,
          kind,
          fill,
          stroke: parseColor(o.stroke) ?? parseColor(o.borderColor),
          textColor: parseColor(o.textColor) ?? parseColor(o.fontColor),
          fontSize: num(o.fontSize),
          shape: shapeFromName(type),
        },
        ctx,
      ),
    );
  }
  return { elements: out, skipped };
}

function buildItem(it: Item, ctx: ImportContext): BoardElement {
  const base = { x: it.x, y: it.y, userId: ctx.userId, zIndex: ctx.z() };
  const w = Math.max(8, it.w);
  const h = Math.max(8, it.h);
  const fontSize = it.fontSize && it.fontSize >= 1 ? it.fontSize : undefined;
  if (it.kind === 'sticky') {
    const el = buildSticky({ ...base, fill: it.fill ?? STICKY_COLORS[0], text: it.text });
    return {
      ...el,
      width: w,
      height: h,
      rotation: it.rotation,
      fontSize: fontSize ?? el.fontSize,
      textColor: it.textColor ?? el.textColor,
      align: it.align ?? el.align,
    };
  }
  if (it.kind === 'text') {
    const el = buildText({ ...base, text: it.text, fontSize, color: it.textColor });
    return {
      ...el,
      width: w,
      height: Math.max(h, el.height),
      rotation: it.rotation,
      align: it.align ?? 'left',
    };
  }
  const el = buildShape({
    ...base,
    shape: it.shape,
    width: w,
    height: h,
    fill: it.fill ?? 'transparent',
    stroke: it.stroke ?? '#1f2937',
  });
  return {
    ...el,
    rotation: it.rotation,
    text: it.text,
    fontSize: fontSize ?? el.fontSize,
    textColor: it.textColor ?? el.textColor,
    align: it.align ?? el.align,
  };
}

function shapeFromName(name: string): ShapeElement['shape'] {
  const n = name.toLowerCase();
  if (/ellipse|circle|oval/.test(n)) return 'ellipse';
  if (/triangle/.test(n)) return 'triangle';
  if (/diamond|rhomb/.test(n)) return 'diamond';
  if (/hexagon/.test(n)) return 'hexagon';
  if (/star/.test(n)) return 'star';
  if (/pill|capsule/.test(n)) return 'pill';
  if (/round/.test(n)) return 'roundRect';
  if (/parallelogram/.test(n)) return 'parallelogram';
  if (/cloud/.test(n)) return 'cloud';
  return 'rect';
}

// ---------- HTML-таблица ----------

export function htmlTable(html: string, ctx: ImportContext): BoardElement | null {
  const table = /<table[\s\S]*?<\/table>/i.exec(html)?.[0];
  if (!table) return null;
  const rows: string[][] = [];
  for (const tr of table.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...tr[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) =>
      htmlToText(c[1] ?? '').slice(0, TABLE_LIMITS.maxCellLength),
    );
    if (cells.length > 0) rows.push(cells.slice(0, TABLE_LIMITS.maxCols));
    if (rows.length >= TABLE_LIMITS.maxRows) break;
  }
  const cols = Math.max(0, ...rows.map((r) => r.length));
  if (rows.length === 0 || cols === 0 || (rows.length === 1 && cols === 1)) return null;
  const el = buildTable({
    x: 0,
    y: 0,
    userId: ctx.userId,
    zIndex: ctx.z(),
    rows: rows.length,
    cols,
  });
  return { ...el, cells: rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? '')) };
}

// ---------- Общие помощники ----------

function parseJson(s: string): unknown {
  if (!s || (s[0] !== '{' && s[0] !== '[')) return undefined;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Цвет: #rgb/#rrggbb(aa), rgb()/rgba(), число 0xRRGGBB → #rrggbb */
export function parseColor(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff)
    return `#${v.toString(16).padStart(6, '0')}`;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (s === 'transparent' || s === 'none') return 'transparent';
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (hex?.[1]) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return `#${h}`;
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s);
  if (rgb)
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((c) => Math.min(255, Number(c)).toString(16).padStart(2, '0'))
      .join('')}`;
  return undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** HTML-текст виджета → обычный текст: абзацы и <br> — переносы строк */
export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return html.trim();
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
