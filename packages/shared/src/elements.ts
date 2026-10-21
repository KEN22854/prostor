import { z } from 'zod';
import { EMBED_PROVIDERS } from './embeds';

/**
 * Модель элементов доски.
 *
 * В Yjs каждый элемент — Y.Map в doc.getMap('elements'), ключ — id.
 * Поля хранятся плоско (а не вложенным JSON), чтобы два пользователя,
 * одновременно меняющие, например, x и fill, не перетирали друг друга:
 * CRDT мержит на уровне ключей Y.Map.
 *
 * Эти zod-схемы используются для:
 *  - валидации импорта (JSON / Miro / FigJam) и ответов ИИ-помощника;
 *  - типизации чтения из Y.Map на клиенте (elementFromYMap);
 *  - сериализации в SVG/PDF.
 */

const finite = z.number().finite();
const color = z.string().max(64);

export const ELEMENT_TYPES = [
  'sticky',
  'text',
  'shape',
  'line',
  'arrow',
  'path',
  'image',
  'frame',
  'table',
  'mindmapNode',
  'kanban',
  'document',
  'pdf',
  'icon',
  'flipCard',
  'timer',
  'vote',
  'bpmn',
  'embed',
] as const;
export const elementTypeSchema = z.enum(ELEMENT_TYPES);
export type ElementType = z.infer<typeof elementTypeSchema>;

export const baseElementSchema = z.object({
  id: z.string().min(1).max(64),
  x: finite,
  y: finite,
  width: finite.nonnegative(),
  height: finite.nonnegative(),
  /** Градусы, по часовой стрелке */
  rotation: finite.default(0),
  /**
   * Порядок отрисовки — дробный индекс (fractional indexing, строка).
   * Строки, а не числа: вставка между двумя элементами не требует
   * перенумерации остальных → один маленький Yjs-апдейт вместо тысяч.
   */
  zIndex: z.string().min(1).max(64),
  /** Слой (id из doc.getMap('meta').layers) */
  layerId: z.string().max(64).optional(),
  /** Родительский фрейм */
  frameId: z.string().max(64).optional(),
  /** Группа (Ctrl+G) */
  groupId: z.string().max(64).optional(),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  opacity: finite.min(0).max(1).default(1),
  createdBy: z.string().max(64),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

const textStyleSchema = z.object({
  fontFamily: z.string().max(64).default('Inter'),
  fontSize: finite.min(4).max(512).default(16),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  textColor: color.default('#1f2937'),
});

/**
 * Форматированный текст (итерация 7b). В Yjs хранится как Y.XmlFragment в поле
 * `content` (y-prosemirror: посимвольное совместное редактирование), а в
 * снапшотах элементов, буфере обмена и импорте — как абзацы с фрагментами.
 * Поле `text` остаётся плоской копией: поиск, LOD, старые клиенты.
 */
export const richRunSchema = z.object({
  text: z.string().max(100_000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
});
export const richParagraphSchema = z.object({
  bullet: z.boolean().optional(),
  runs: z.array(richRunSchema).max(2_000),
});
export const richTextSchema = z.array(richParagraphSchema).max(5_000);
export type RichRun = z.infer<typeof richRunSchema>;
export type RichParagraph = z.infer<typeof richParagraphSchema>;

/** Плоский текст из абзацев (маркеры списков — «• ») */
export function richToPlain(paragraphs: readonly RichParagraph[]): string {
  return paragraphs
    .map((p) => (p.bullet ? '• ' : '') + p.runs.map((r) => r.text).join(''))
    .join('\n');
}

/** Есть ли в тексте что-то кроме обычного (иначе рисуем быстрым Konva.Text) */
export function isRichFormatted(paragraphs: readonly RichParagraph[] | undefined): boolean {
  return Boolean(
    paragraphs?.some(
      (p) => p.bullet || p.runs.some((r) => r.bold || r.italic || r.underline || r.strike),
    ),
  );
}

export const stickySchema = baseElementSchema.extend({
  type: z.literal('sticky'),
  text: z.string().max(10_000),
  fill: color,
  /** Отображаемое имя автора на стикере */
  authorName: z.string().max(120).optional(),
  rich: richTextSchema.optional(),
  ...textStyleSchema.shape,
});

export const textSchema = baseElementSchema.extend({
  type: z.literal('text'),
  text: z.string().max(100_000),
  rich: richTextSchema.optional(),
  ...textStyleSchema.shape,
});

export const SHAPE_KINDS = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'star'] as const;

export const shapeSchema = baseElementSchema.extend({
  type: z.literal('shape'),
  shape: z.enum(SHAPE_KINDS),
  fill: color,
  stroke: color,
  strokeWidth: finite.min(0).max(100),
  text: z.string().max(10_000).default(''),
  rich: richTextSchema.optional(),
  ...textStyleSchema.shape,
});

const pointsSchema = z
  .array(finite)
  .max(200_000)
  .refine((p) => p.length % 2 === 0, {
    message: 'points должен содержать пары x,y',
  });

/** Привязка конца линии/стрелки к элементу — стрелка «едет» за фигурой */
const bindingSchema = z
  .object({
    elementId: z.string().max(64),
    anchor: z.enum(['auto', 'top', 'right', 'bottom', 'left']),
  })
  .optional();

export const lineSchema = baseElementSchema.extend({
  type: z.enum(['line', 'arrow']),
  points: pointsSchema,
  stroke: color,
  strokeWidth: finite.min(0).max(100),
  dash: z.array(finite).max(8).optional(),
  startBinding: bindingSchema,
  endBinding: bindingSchema,
  startArrow: z.enum(['none', 'arrow', 'dot']).default('none'),
  endArrow: z.enum(['none', 'arrow', 'dot']).default('arrow'),
  /** Маршрут: прямая, ломаная под прямыми углами, плавная кривая */
  routing: z.enum(['straight', 'elbow', 'curved']).default('straight'),
  /** Подпись посередине линии */
  label: z.string().max(500).optional(),
});

export type LineRouting = 'straight' | 'elbow' | 'curved';
export type BindingAnchor = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export const pathSchema = baseElementSchema.extend({
  type: z.literal('path'),
  /** Точки относительно (x, y), уже упрощённые (Ramer–Douglas–Peucker) */
  points: pointsSchema,
  stroke: color,
  strokeWidth: finite.min(0.5).max(200),
  /** Маркер (полупрозрачный, multiply) vs. карандаш */
  tool: z.enum(['pen', 'marker', 'highlighter']).default('pen'),
});

export const imageSchema = baseElementSchema.extend({
  type: z.literal('image'),
  assetId: z.string().max(64),
  /** Исходные пиксельные размеры — для экспорта в полном качестве */
  naturalWidth: z.number().int().positive(),
  naturalHeight: z.number().int().positive(),
  alt: z.string().max(500).optional(),
  /** Обрезка: видимая часть в пикселях исходника (нет — картинка целиком) */
  crop: z
    .object({
      x: finite.nonnegative(),
      y: finite.nonnegative(),
      width: finite.positive(),
      height: finite.positive(),
    })
    .optional(),
  /** Подпись источника (автор, лицензия) — для картинок из ленты */
  attribution: z.string().max(500).optional(),
});

export type ImageCrop = NonNullable<z.infer<typeof imageSchema>['crop']>;

export const frameSchema = baseElementSchema.extend({
  type: z.literal('frame'),
  title: z.string().max(200),
  fill: color.default('#ffffff'),
  /** Порядок в режиме презентации */
  presentationOrder: z.number().int().optional(),
  speakerNotes: z.string().max(20_000).optional(),
  clipContent: z.boolean().default(true),
});

export const TABLE_LIMITS = { maxRows: 100, maxCols: 30, maxCellLength: 2000 } as const;

/** Ключ ячейки таблицы в Y.Map элемента: каждая ячейка — отдельное поле (CRDT по ячейкам) */
export function tableCellKey(row: number, col: number): string {
  return `cell:${row}:${col}`;
}

/**
 * Таблица. В Yjs ячейки — плоские поля "cell:r:c": два человека, правящие
 * разные ячейки, не перетирают друг друга. При чтении (и в JSON экспорта,
 * буфера обмена, импорта) они собираются в cells[строка][столбец].
 */
export const tableSchema = baseElementSchema.extend({
  type: z.literal('table'),
  rows: z.number().int().min(1).max(TABLE_LIMITS.maxRows),
  cols: z.number().int().min(1).max(TABLE_LIMITS.maxCols),
  /** Доли ширины/высоты по столбцам и строкам (сумма — 1): размер таблицы задают width/height */
  colWidths: z.array(finite.positive()).max(TABLE_LIMITS.maxCols),
  rowHeights: z.array(finite.positive()).max(TABLE_LIMITS.maxRows),
  headerRow: z.boolean().default(true),
  fill: color.default('#ffffff'),
  headerFill: color.default('#f1f5f9'),
  stroke: color.default('#cbd5e1'),
  color: color.default('#1f2937'),
  fontSize: finite.min(6).max(96).default(14),
  cells: z.array(z.array(z.string().max(TABLE_LIMITS.maxCellLength))).optional(),
});

/** Ссылка-карточка; у видео и дизайн-сервисов — с плеером (embedUrl) */
export const embedSchema = baseElementSchema.extend({
  type: z.literal('embed'),
  url: z.string().max(2048),
  provider: z.enum(EMBED_PROVIDERS),
  embedUrl: z.string().max(4096).nullable().optional(),
  title: z.string().max(500),
  description: z.string().max(1000).nullable().optional(),
  siteName: z.string().max(200),
  imageAssetId: z.string().max(64).nullable().optional(),
});

/**
 * Элементы, ещё не реализованные в итерациях 1–4, описаны «мягко»:
 * общие поля + произвольный payload. Схемы ужесточаются в своих итерациях.
 */
export const genericElementSchema = baseElementSchema.extend({
  type: z.enum([
    'mindmapNode',
    'kanban',
    'document',
    'pdf',
    'icon',
    'flipCard',
    'timer',
    'vote',
    'bpmn',
  ]),
  data: z.record(z.string(), z.unknown()).default({}),
});

type GenericType = z.infer<typeof genericElementSchema>['type'];

/** discriminatedUnion требует литерал в дискриминаторе у каждого варианта */
function generic<T extends GenericType>(type: T) {
  return genericElementSchema.extend({ type: z.literal(type) });
}

export const boardElementSchema = z.discriminatedUnion('type', [
  stickySchema,
  textSchema,
  shapeSchema,
  lineSchema.extend({ type: z.literal('line') }),
  lineSchema.extend({ type: z.literal('arrow') }),
  pathSchema,
  imageSchema,
  frameSchema,
  tableSchema,
  embedSchema,
  generic('mindmapNode'),
  generic('kanban'),
  generic('document'),
  generic('pdf'),
  generic('icon'),
  generic('flipCard'),
  generic('timer'),
  generic('vote'),
  generic('bpmn'),
]);

export type StickyElement = z.infer<typeof stickySchema>;
export type TextElement = z.infer<typeof textSchema>;
export type ShapeElement = z.infer<typeof shapeSchema>;
export type LineElement = z.infer<typeof lineSchema>;
export type PathElement = z.infer<typeof pathSchema>;
export type ImageElement = z.infer<typeof imageSchema>;
export type FrameElement = z.infer<typeof frameSchema>;
export type TableElement = z.infer<typeof tableSchema>;
export type EmbedElement = z.infer<typeof embedSchema>;
export type GenericElement = z.infer<typeof genericElementSchema>;
export type BoardElement =
  | StickyElement
  | TextElement
  | ShapeElement
  | LineElement
  | PathElement
  | ImageElement
  | FrameElement
  | TableElement
  | EmbedElement
  | GenericElement;

/** Axis-aligned bounding box в мировых координатах */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * AABB элемента с учётом поворота вокруг (x, y) — как вращает Konva.
 * Используется R-tree индексом для виртуализации и hit-test.
 */
export function elementBounds(
  el: Pick<BoardElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
): Bounds {
  const rotation = el.rotation ?? 0;
  if (rotation % 360 === 0) {
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [el.width, 0],
    [el.width, el.height],
    [0, el.height],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of corners) {
    const px = el.x + cx * cos - cy * sin;
    const py = el.y + cx * sin + cy * cos;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { minX, minY, maxX, maxY };
}
