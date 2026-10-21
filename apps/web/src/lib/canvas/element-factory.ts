import { generateKeyBetween } from 'fractional-indexing';
import { nanoid } from 'nanoid';
import * as Y from 'yjs';
import {
  Y_KEYS,
  richTextSchema,
  type BoardElement,
  type EmbedElement,
  type EmbedPreview,
  type FrameElement,
  type ImageElement,
  type LineElement,
  type PathElement,
  type ShapeElement,
  type StickyElement,
  type TableElement,
  type TextElement,
} from '@prostor/shared';
import { richToFragment } from '@/lib/rich-text/yjs-convert';
import { TABLE_DEFAULT, cellsToFields, tableFields } from '@/lib/canvas/table';

/** Наибольший zIndex на доске (fractional index, сравнение строк) */
export function maxZIndex(elements: Y.Map<unknown>): string | null {
  let max: string | null = null;
  for (const el of elements.values()) {
    if (!(el instanceof Y.Map)) continue;
    const z = el.get('zIndex');
    if (typeof z === 'string' && (max === null || z > max)) max = z;
  }
  return max;
}

/** Наименьший zIndex (для «на задний план») */
export function minZIndex(elements: Y.Map<unknown>): string | null {
  let min: string | null = null;
  for (const el of elements.values()) {
    if (!(el instanceof Y.Map)) continue;
    const z = el.get('zIndex');
    if (typeof z === 'string' && (min === null || z < min)) min = z;
  }
  return min;
}

/**
 * Элемент в Yjs — Y.Map с плоскими полями: одновременные правки разных полей
 * (позиция у одного пользователя, цвет у другого) мержатся без потерь.
 */
export function toYMap(element: Record<string, unknown>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(element)) {
    if (value === undefined) continue;
    // Абзацы форматированного текста хранятся как Y.XmlFragment (совместное редактирование)
    // Ячейки таблицы — отдельными полями: правки разных ячеек не конфликтуют
    if (key === 'cells') {
      if (Array.isArray(value)) {
        for (const [k, v] of Object.entries(cellsToFields(value as string[][]))) map.set(k, v);
      }
      continue;
    }
    if (key === 'rich') {
      const parsed = richTextSchema.safeParse(value);
      if (parsed.success) map.set('content', richToFragment(parsed.data));
      continue;
    }
    map.set(key, value);
  }
  return map;
}

export function newElementId(): string {
  return nanoid(12);
}

interface BaseParams {
  x: number;
  y: number;
  userId: string;
  zIndex: string;
}

function baseFields(p: BaseParams, width: number, height: number) {
  const now = Date.now();
  return {
    id: newElementId(),
    x: p.x,
    y: p.y,
    width,
    height,
    rotation: 0,
    zIndex: p.zIndex,
    locked: false,
    hidden: false,
    opacity: 1,
    createdBy: p.userId,
    createdAt: now,
    updatedAt: now,
  };
}

const TEXT_DEFAULTS = {
  fontFamily: 'Inter',
  fontWeight: 'normal' as const,
  fontStyle: 'normal' as const,
  textColor: '#1f2937',
};

export const STICKY_SIZE = 200;

export function buildSticky(
  p: BaseParams & { fill: string; text?: string; authorName?: string },
): StickyElement {
  return {
    ...baseFields(p, STICKY_SIZE, STICKY_SIZE),
    ...TEXT_DEFAULTS,
    type: 'sticky',
    text: p.text ?? '',
    fill: p.fill,
    authorName: p.authorName,
    fontSize: 18,
    align: 'left',
    verticalAlign: 'top',
  };
}

export function buildShape(
  p: BaseParams & {
    shape: ShapeElement['shape'];
    width: number;
    height: number;
    fill: string;
    stroke: string;
  },
): ShapeElement {
  return {
    ...baseFields(p, p.width, p.height),
    ...TEXT_DEFAULTS,
    type: 'shape',
    shape: p.shape,
    fill: p.fill,
    stroke: p.stroke,
    strokeWidth: 2,
    text: '',
    fontSize: 16,
    align: 'center',
    verticalAlign: 'middle',
  };
}

export const TEXT_DEFAULT_WIDTH = 240;

export function buildText(
  p: BaseParams & { text?: string; fontSize?: number; color?: string },
): TextElement {
  const fontSize = p.fontSize ?? 20;
  return {
    ...baseFields(p, TEXT_DEFAULT_WIDTH, Math.ceil(fontSize * 1.3)),
    ...TEXT_DEFAULTS,
    textColor: p.color ?? TEXT_DEFAULTS.textColor,
    type: 'text',
    text: p.text ?? '',
    fontSize,
    align: 'left',
    verticalAlign: 'top',
  };
}

/** Линия/стрелка: (x, y) — начало, points — относительно начала */
export function buildLine(
  p: BaseParams & {
    type: 'line' | 'arrow';
    dx: number;
    dy: number;
    stroke: string;
    strokeWidth: number;
    routing?: LineElement['routing'];
    startBinding?: LineElement['startBinding'];
    endBinding?: LineElement['endBinding'];
  },
): LineElement {
  return {
    ...baseFields(p, Math.abs(p.dx), Math.abs(p.dy)),
    type: p.type,
    points: [0, 0, p.dx, p.dy],
    stroke: p.stroke,
    strokeWidth: p.strokeWidth,
    startArrow: 'none',
    endArrow: p.type === 'arrow' ? 'arrow' : 'none',
    routing: p.routing ?? 'straight',
    ...(p.startBinding ? { startBinding: p.startBinding } : {}),
    ...(p.endBinding ? { endBinding: p.endBinding } : {}),
  };
}

/** Ширина карточки ссылки и высота её текстовой части */
export const EMBED_CARD = { width: 360, textHeight: 76 } as const;

/**
 * Карточка ссылки по превью с сервера. Картинка превью задаёт высоту
 * (в разумных пределах), без картинки — у плееров соотношение сторон сервиса.
 */
export function buildEmbed(p: BaseParams & { preview: EmbedPreview }): EmbedElement {
  const { preview } = p;
  const width = EMBED_CARD.width;
  const imageRatio =
    preview.imageWidth && preview.imageHeight ? preview.imageHeight / preview.imageWidth : null;
  const mediaHeight = imageRatio
    ? Math.round(width * Math.min(1.2, Math.max(0.35, imageRatio)))
    : preview.embedUrl
      ? Math.round(width / preview.aspect)
      : 0;
  return {
    ...baseFields(p, width, mediaHeight + EMBED_CARD.textHeight),
    type: 'embed',
    url: preview.url,
    provider: preview.provider,
    embedUrl: preview.embedUrl,
    title: preview.title,
    description: preview.description,
    siteName: preview.siteName,
    imageAssetId: preview.imageAssetId,
  };
}

/** Таблица rows×cols с пустыми ячейками; первая строка — заголовок */
export function buildTable(
  p: BaseParams & { rows?: number; cols?: number; width?: number; height?: number },
): TableElement {
  const rows = p.rows ?? TABLE_DEFAULT.rows;
  const cols = p.cols ?? TABLE_DEFAULT.cols;
  const width = p.width ?? cols * TABLE_DEFAULT.cellWidth;
  const height = p.height ?? rows * TABLE_DEFAULT.cellHeight;
  return {
    ...baseFields(p, width, height),
    type: 'table',
    ...tableFields(rows, cols),
    headerRow: true,
    fill: '#ffffff',
    headerFill: '#f1f5f9',
    stroke: '#cbd5e1',
    color: '#1f2937',
    fontSize: 14,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
  };
}

/**
 * Росчерк карандаша из абсолютных мировых точек: (x, y) — левый верхний угол
 * bbox, точки — относительно него. Так bbox элемента совпадает с x/y/width/height.
 */
export function buildPath(
  p: Omit<BaseParams, 'x' | 'y'> & {
    absolutePoints: readonly number[];
    stroke: string;
    strokeWidth: number;
    tool: PathElement['tool'];
  },
): PathElement {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < p.absolutePoints.length; i += 2) {
    const x = p.absolutePoints[i] ?? 0;
    const y = p.absolutePoints[i + 1] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const points = p.absolutePoints.map(
    (v, i) => Math.round((v - (i % 2 === 0 ? minX : minY)) * 10) / 10,
  );
  return {
    ...baseFields({ ...p, x: minX, y: minY }, maxX - minX, maxY - minY),
    type: 'path',
    points,
    stroke: p.stroke,
    strokeWidth: p.strokeWidth,
    tool: p.tool,
  };
}

export function buildImage(
  p: BaseParams & {
    assetId: string;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
    alt?: string;
  },
): ImageElement {
  return {
    ...baseFields(p, p.width, p.height),
    type: 'image',
    assetId: p.assetId,
    naturalWidth: p.naturalWidth,
    naturalHeight: p.naturalHeight,
    alt: p.alt,
  };
}

export function buildFrame(
  p: BaseParams & { width: number; height: number; title: string },
): FrameElement {
  return {
    ...baseFields(p, p.width, p.height),
    type: 'frame',
    title: p.title,
    fill: '#ffffff',
    clipContent: true,
  };
}

/** Вставка готовых элементов (вызывающий оборачивает в транзакцию с LOCAL_ORIGIN) */
export function insertElements(doc: Y.Doc, elements: readonly BoardElement[]): void {
  const map = doc.getMap<unknown>(Y_KEYS.elements);
  for (const el of elements) map.set(el.id, toYMap(el as unknown as Record<string, unknown>));
}

/** zIndex для нового элемента поверх всех */
export function nextZIndex(doc: Y.Doc): string {
  return generateKeyBetween(maxZIndex(doc.getMap<unknown>(Y_KEYS.elements)), null);
}

/** Совместимость с итерацией 4a (тесты и dev-генератор) */
export function createSticky(
  doc: Y.Doc,
  params: { x: number; y: number; text: string; fill: string; userId: string; authorName?: string },
): StickyElement {
  const el = buildSticky({ ...params, zIndex: nextZIndex(doc) });
  insertElements(doc, [el]);
  return el;
}
