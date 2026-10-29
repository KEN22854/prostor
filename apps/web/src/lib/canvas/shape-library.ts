import { SHAPE_KINDS, type BoardElement, type ShapeElement } from '@prostor/shared';
import { buildShape, buildTable } from '@/lib/canvas/element-factory';
import { SHAPE_LABELS } from '@/lib/canvas/shape-paths';

/**
 * Библиотеки фигур: блок-схемы, базовые фигуры, UML, ER-диаграммы
 * (собираются из фигур и таблиц доски — их можно править как обычно)
 * и иконки сети и облаков (картинки из открытых наборов Iconify).
 */
export interface LibraryShapeItem {
  kind: 'shape';
  id: string;
  label: string;
  shape: ShapeElement['shape'];
  width: number;
  height: number;
  fill: string;
  stroke: string;
  text?: string;
}

export interface LibraryTableItem {
  kind: 'table';
  id: string;
  label: string;
  /** Строки × столбцы; первая строка — заголовок */
  cells: string[][];
  width: number;
  headerFill: string;
}

export interface LibraryIconItem {
  kind: 'icon';
  /** id Iconify: набор:имя */
  id: string;
  label: string;
}

export type LibraryItem = LibraryShapeItem | LibraryTableItem | LibraryIconItem;

export interface LibraryCategory {
  id: string;
  label: string;
  items: LibraryItem[];
  /** Лицензия иконок — показывается в панели */
  note?: string;
}

const INK = '#1f2937';
const shape = (
  id: string,
  label: string,
  kind: ShapeElement['shape'],
  fill: string,
  size: [number, number] = [160, 80],
  text = label,
): LibraryShapeItem => ({
  kind: 'shape',
  id,
  label,
  shape: kind,
  width: size[0],
  height: size[1],
  fill,
  stroke: INK,
  text,
});

export const SHAPE_LIBRARY: LibraryCategory[] = [
  {
    id: 'flowchart',
    label: 'Блок-схема',
    items: [
      shape('terminator', 'Начало / конец', 'pill', '#ddd6fe', [160, 64], 'Начало'),
      shape('process', 'Процесс', 'rect', '#ffffff'),
      shape('decision', 'Решение', 'diamond', '#fde68a', [160, 110], 'Условие?'),
      shape('data', 'Данные', 'parallelogram', '#bfdbfe', [170, 80], 'Ввод данных'),
      shape('document', 'Документ', 'document', '#fbcfe8', [160, 90]),
      shape('database', 'База данных', 'cylinder', '#bbf7d0', [120, 120], 'БД'),
      shape('preparation', 'Подготовка', 'hexagon', '#fed7aa', [170, 80]),
      shape('manual', 'Ручная операция', 'trapezoid', '#e5e7eb', [170, 80]),
      shape('connector', 'Соединитель', 'ellipse', '#ffffff', [56, 56], 'A'),
      shape('note', 'Комментарий', 'callout', '#fef9c3', [170, 100], 'Пояснение'),
    ],
  },
  {
    id: 'basic',
    label: 'Фигуры',
    items: SHAPE_KINDS.map((kind) =>
      shape(
        `basic-${kind}`,
        SHAPE_LABELS[kind],
        kind,
        '#ffffff',
        ['ellipse', 'star', 'plus', 'triangle', 'cylinder'].includes(kind)
          ? [120, 120]
          : [160, 100],
        '',
      ),
    ),
  },
  {
    id: 'uml',
    label: 'UML',
    items: [
      {
        kind: 'table',
        id: 'uml-class',
        label: 'Класс',
        cells: [['Класс'], ['+ поле: Тип\n- скрытое: Тип'], ['+ метод(): Тип']],
        width: 220,
        headerFill: '#ddd6fe',
      },
      {
        kind: 'table',
        id: 'uml-interface',
        label: 'Интерфейс',
        cells: [['«interface» Имя'], ['+ метод(): Тип']],
        width: 220,
        headerFill: '#bfdbfe',
      },
      shape('uml-usecase', 'Вариант использования', 'ellipse', '#ffffff', [200, 90]),
      shape('uml-component', 'Компонент', 'rect', '#f5f3ff', [180, 90]),
      shape('uml-note', 'Заметка', 'document', '#fef9c3', [170, 100]),
      shape('uml-package', 'Пакет', 'roundRect', '#ede9fe', [200, 120]),
      { kind: 'icon', id: 'mdi:account', label: 'Актёр' },
      { kind: 'icon', id: 'mdi:account-group', label: 'Группа' },
    ],
  },
  {
    id: 'er',
    label: 'ER-диаграмма',
    items: [
      {
        kind: 'table',
        id: 'er-entity',
        label: 'Сущность',
        cells: [
          ['Сущность', 'Тип'],
          ['id', 'uuid PK'],
          ['name', 'text'],
          ['created_at', 'timestamp'],
        ],
        width: 260,
        headerFill: '#ddd6fe',
      },
      {
        kind: 'table',
        id: 'er-link',
        label: 'Связующая таблица',
        cells: [
          ['Связь', 'Тип'],
          ['a_id', 'uuid FK'],
          ['b_id', 'uuid FK'],
        ],
        width: 240,
        headerFill: '#fbcfe8',
      },
      shape('er-relation', 'Связь', 'diamond', '#fde68a', [150, 100], 'связь'),
      shape('er-attribute', 'Атрибут', 'ellipse', '#ffffff', [150, 70], 'атрибут'),
      shape('er-weak', 'Слабая сущность', 'rect', '#f5f3ff', [170, 80]),
    ],
  },
  {
    id: 'network',
    label: 'Сеть и облако',
    note: 'Иконки: Material Design Icons (Apache 2.0), SVG Logos (CC0)',
    items: [
      ['mdi:server', 'Сервер'],
      ['mdi:database', 'База данных'],
      ['mdi:router-wireless', 'Роутер'],
      ['mdi:lan', 'Сеть'],
      ['mdi:wall-fire', 'Файрвол'],
      ['mdi:cloud-outline', 'Облако'],
      ['mdi:web', 'Интернет'],
      ['mdi:laptop', 'Ноутбук'],
      ['mdi:monitor', 'Компьютер'],
      ['mdi:cellphone', 'Телефон'],
      ['mdi:email-outline', 'Почта'],
      ['mdi:shield-lock-outline', 'Безопасность'],
      ['logos:aws', 'AWS'],
      ['logos:aws-ec2', 'AWS EC2'],
      ['logos:aws-s3', 'AWS S3'],
      ['logos:aws-lambda', 'AWS Lambda'],
      ['logos:aws-rds', 'AWS RDS'],
      ['logos:google-cloud', 'Google Cloud'],
      ['logos:microsoft-azure', 'Azure'],
      ['logos:kubernetes', 'Kubernetes'],
      ['logos:docker-icon', 'Docker'],
      ['logos:postgresql', 'PostgreSQL'],
      ['logos:redis', 'Redis'],
      ['logos:nginx', 'Nginx'],
      ['logos:nodejs-icon', 'Node.js'],
      ['logos:python', 'Python'],
      ['logos:react', 'React'],
      ['logos:linux-tux', 'Linux'],
      ['logos:github-icon', 'GitHub'],
      ['logos:gitlab', 'GitLab'],
      ['logos:kafka-icon', 'Kafka'],
      ['logos:rabbitmq-icon', 'RabbitMQ'],
    ].map(([id, label]) => ({ kind: 'icon' as const, id: id!, label: label! })),
  },
];

/** Размер иконки на доске по большей стороне */
export const LIBRARY_ICON_SIZE = 96;

/** Элемент доски из пункта библиотеки (иконки добавляются отдельно — через загрузку) */
export function buildLibraryElement(
  item: LibraryShapeItem | LibraryTableItem,
  center: { x: number; y: number },
  userId: string,
  zIndex: string,
): BoardElement {
  if (item.kind === 'shape') {
    const el = buildShape({
      x: center.x - item.width / 2,
      y: center.y - item.height / 2,
      width: item.width,
      height: item.height,
      shape: item.shape,
      fill: item.fill,
      stroke: item.stroke,
      userId,
      zIndex,
    });
    return { ...el, text: item.text ?? '' };
  }
  const rows = item.cells.length;
  const cols = item.cells[0]?.length ?? 1;
  // Строки с переносами — выше
  const lineCounts = item.cells.map((row) => Math.max(1, ...row.map((c) => c.split('\n').length)));
  const totalLines = lineCounts.reduce((a, b) => a + b, 0);
  const height = totalLines * 30 + rows * 6;
  const table = buildTable({
    x: center.x - item.width / 2,
    y: center.y - height / 2,
    rows,
    cols,
    width: item.width,
    height,
    userId,
    zIndex,
  });
  return {
    ...table,
    rowHeights: lineCounts.map((n) => n / totalLines),
    headerFill: item.headerFill,
    cells: item.cells,
  };
}
