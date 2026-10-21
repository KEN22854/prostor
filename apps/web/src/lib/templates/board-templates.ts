import type { BoardElement, BoardTemplateKey } from '@prostor/shared';
import { TemplateBuilder, edgeToward, rectCenter, side } from '@/lib/templates/template-builder';

const YELLOW = '#fde68a';
const GREEN = '#bbf7d0';
const BLUE = '#bfdbfe';
const PINK = '#fbcfe8';
const VIOLET = '#ddd6fe';
const ORANGE = '#fed7aa';

type Rect = { x: number; y: number; width: number; height: number };

function mindmap(b: TemplateBuilder): void {
  const center: Rect = { x: -150, y: -60, width: 300, height: 120 };
  b.shape(center, 'ellipse', 'Центральная тема', { fill: VIOLET, fontSize: 22 });
  const branches = [
    { text: 'Цели', fill: GREEN },
    { text: 'Идеи', fill: YELLOW },
    { text: 'Риски', fill: PINK },
    { text: 'Ресурсы', fill: BLUE },
    { text: 'Сроки', fill: ORANGE },
    { text: 'Команда', fill: GREEN },
  ];
  branches.forEach((br, i) => {
    const angle = (i / branches.length) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(angle) * 460;
    const cy = Math.sin(angle) * 300;
    const rect: Rect = { x: cx - 110, y: cy - 40, width: 220, height: 80 };
    b.shape(rect, 'roundRect', br.text, { fill: br.fill, fontSize: 18 });
    // Стрелка от края эллипса до края ветки
    b.arrow(edgeToward(center, rectCenter(rect), true), edgeToward(rect, rectCenter(center)));
  });
}

function columns(
  b: TemplateBuilder,
  titles: Array<{ title: string; fill: string; stickies: string[] }>,
  opts: { width: number; height: number; gap: number; stickyFill?: string },
): void {
  titles.forEach((col, i) => {
    const x = i * (opts.width + opts.gap);
    const frameId = b.frame(
      { x, y: 0, width: opts.width, height: opts.height },
      col.title,
      col.fill,
    );
    col.stickies.forEach((text, j) => {
      const sx = x + 40 + (j % 2) * 200;
      const sy = 40 + Math.floor(j / 2) * 200;
      b.sticky(sx, sy, text, opts.stickyFill ?? YELLOW, frameId, 170);
    });
  });
}

function kanban(b: TemplateBuilder): void {
  columns(
    b,
    [
      {
        title: 'Бэклог',
        fill: '#f8fafc',
        stickies: ['Описать требования', 'Собрать обратную связь'],
      },
      { title: 'К работе', fill: '#f8fafc', stickies: ['Макет главной страницы'] },
      { title: 'В работе', fill: '#eff6ff', stickies: ['API авторизации', 'Тесты оплаты'] },
      { title: 'Готово', fill: '#f0fdf4', stickies: ['Настроить CI'] },
    ],
    { width: 440, height: 900, gap: 40 },
  );
}

function retro(b: TemplateBuilder): void {
  b.text(0, -110, 'Ретроспектива спринта', { fontSize: 36, bold: true, width: 900 });
  const cols = [
    { title: 'Что было хорошо', fill: '#f0fdf4', sticky: GREEN, hint: 'Релиз прошёл без откатов' },
    { title: 'Что улучшить', fill: '#fff7ed', sticky: ORANGE, hint: 'Долгие код-ревью' },
    {
      title: 'Действия',
      fill: '#eff6ff',
      sticky: BLUE,
      hint: 'Ревью в течение дня — ответственный: …',
    },
  ];
  cols.forEach((col, i) => {
    const x = i * 520;
    const frameId = b.frame({ x, y: 0, width: 480, height: 800 }, col.title, col.fill);
    b.sticky(x + 40, 40, col.hint, col.sticky, frameId, 180);
  });
}

function flowchart(b: TemplateBuilder): void {
  const start: Rect = { x: 0, y: 0, width: 200, height: 80 };
  const step: Rect = { x: 0, y: 180, width: 200, height: 90 };
  const decision: Rect = { x: -10, y: 370, width: 220, height: 140 };
  const yes: Rect = { x: -260, y: 620, width: 200, height: 90 };
  const no: Rect = { x: 260, y: 620, width: 200, height: 90 };
  const end: Rect = { x: 0, y: 820, width: 200, height: 80 };
  b.shape(start, 'ellipse', 'Начало', { fill: GREEN });
  b.shape(step, 'rect', 'Получить заявку', { fill: BLUE });
  b.shape(decision, 'diamond', 'Данные верны?', { fill: YELLOW });
  b.shape(yes, 'rect', 'Обработать', { fill: BLUE });
  b.shape(no, 'rect', 'Запросить уточнение', { fill: PINK });
  b.shape(end, 'ellipse', 'Конец', { fill: GREEN });
  b.arrow(side.bottom(start), side.top(step));
  b.arrow(side.bottom(step), side.top(decision));
  // Ортогональные связи: из ромба вбок, затем вниз
  b.arrow(side.left(decision), side.top(yes), {
    label: 'Да',
    via: [{ x: side.top(yes).x, y: side.left(decision).y }],
  });
  b.arrow(side.right(decision), side.top(no), {
    label: 'Нет',
    via: [{ x: side.top(no).x, y: side.right(decision).y }],
  });
  b.arrow(side.bottom(yes), side.left(end), {
    via: [{ x: side.bottom(yes).x, y: side.left(end).y }],
  });
  // Возврат на уточнение — в обход справа
  const back = side.right(no).x + 60;
  b.arrow(side.right(no), side.right(step), {
    via: [
      { x: back, y: side.right(no).y },
      { x: back, y: side.right(step).y },
    ],
  });
}

function bpmn(b: TemplateBuilder): void {
  const lanes = ['Клиент', 'Менеджер', 'Склад'];
  const laneH = 260;
  lanes.forEach((lane, i) => {
    b.frame(
      { x: 0, y: i * (laneH + 10), width: 1500, height: laneH },
      lane,
      i % 2 ? '#f8fafc' : '#ffffff',
    );
  });
  const mid = (lane: number) => lane * (laneH + 10) + laneH / 2;
  const startEv: Rect = { x: 60, y: mid(0) - 30, width: 60, height: 60 };
  const order: Rect = { x: 200, y: mid(0) - 45, width: 180, height: 90 };
  const check: Rect = { x: 460, y: mid(1) - 45, width: 180, height: 90 };
  const gateway: Rect = { x: 720, y: mid(1) - 45, width: 90, height: 90 };
  const reserve: Rect = { x: 900, y: mid(2) - 45, width: 180, height: 90 };
  const reject: Rect = { x: 900, y: mid(1) - 45, width: 180, height: 90 };
  const endEv: Rect = { x: 1300, y: mid(0) - 30, width: 60, height: 60 };
  b.shape(startEv, 'ellipse', '', { fill: GREEN, stroke: '#30a46c' });
  b.shape(order, 'roundRect', 'Оформить заказ');
  b.shape(check, 'roundRect', 'Проверить заказ');
  b.shape(gateway, 'diamond', '×', { fill: YELLOW, fontSize: 28 });
  b.shape(reserve, 'roundRect', 'Зарезервировать товар');
  b.shape(reject, 'roundRect', 'Отклонить заказ', { fill: PINK });
  b.shape(endEv, 'ellipse', '', { fill: PINK, stroke: '#e5484d' });
  // BPMN-связи — ортогональные ломаные
  b.arrow(side.right(startEv), side.left(order));
  b.arrow(side.bottom(order), side.left(check), {
    via: [{ x: side.bottom(order).x, y: side.left(check).y }],
  });
  b.arrow(side.right(check), side.left(gateway));
  b.arrow(side.bottom(gateway), side.left(reserve), {
    label: 'да',
    via: [{ x: side.bottom(gateway).x, y: side.left(reserve).y }],
    labelAt: { x: side.bottom(gateway).x + 8, y: side.bottom(gateway).y + 12 },
  });
  b.arrow(side.right(gateway), side.left(reject), { label: 'нет' });
  const endX = side.bottom(endEv).x;
  b.arrow(side.right(reserve), side.bottom(endEv), {
    via: [{ x: endX, y: side.right(reserve).y }],
  });
  // Обе ветки сходятся в завершающем событии по общей вертикали
  b.arrow(side.right(reject), side.bottom(endEv), { via: [{ x: endX, y: side.right(reject).y }] });
}

function swot(b: TemplateBuilder): void {
  const quads = [
    { title: 'S — сильные стороны', fill: '#f0fdf4', sticky: GREEN, x: 0, y: 0 },
    { title: 'W — слабые стороны', fill: '#fff1f2', sticky: PINK, x: 660, y: 0 },
    { title: 'O — возможности', fill: '#eff6ff', sticky: BLUE, x: 0, y: 560 },
    { title: 'T — угрозы', fill: '#fff7ed', sticky: ORANGE, x: 660, y: 560 },
  ];
  for (const q of quads) {
    const frameId = b.frame({ x: q.x, y: q.y, width: 620, height: 500 }, q.title, q.fill);
    b.sticky(q.x + 40, q.y + 40, 'Добавьте пункт', q.sticky, frameId, 170);
  }
}

function storyMap(b: TemplateBuilder): void {
  const activities = ['Найти товар', 'Выбрать', 'Оформить заказ', 'Получить'];
  const tasks = [
    ['Поиск', 'Фильтры'],
    ['Карточка товара', 'Сравнение'],
    ['Корзина', 'Оплата'],
    ['Доставка', 'Отзыв'],
  ];
  const colW = 240;
  const frameId = b.frame(
    { x: 0, y: 0, width: activities.length * colW + 200, height: 760 },
    'Карта пользовательских историй',
  );
  b.text(20, 60, 'Активности', { fontSize: 16, color: '#64748b', width: 160, frameId });
  b.text(20, 300, 'Релиз 1', { fontSize: 16, bold: true, width: 160, frameId });
  b.text(20, 560, 'Релиз 2', { fontSize: 16, bold: true, width: 160, frameId });
  activities.forEach((a, i) => {
    const x = 180 + i * colW;
    b.sticky(x, 30, a, VIOLET, frameId, 180);
    b.sticky(x, 270, tasks[i]?.[0] ?? '', BLUE, frameId, 160);
    b.sticky(x, 530, tasks[i]?.[1] ?? '', YELLOW, frameId, 160);
  });
  b.line({ x: 20, y: 240 }, { x: activities.length * colW + 180, y: 240 }, frameId, true);
  b.line({ x: 20, y: 500 }, { x: activities.length * colW + 180, y: 500 }, frameId, true);
}

const BUILDERS: Record<Exclude<BoardTemplateKey, 'blank'>, (b: TemplateBuilder) => void> = {
  mindmap,
  kanban,
  retro,
  flowchart,
  bpmn,
  swot,
  'story-map': storyMap,
};

/** Содержимое шаблона; для пустой доски — пустой список */
export function buildTemplate(key: BoardTemplateKey, userId: string): BoardElement[] {
  if (key === 'blank') return [];
  const builder = new TemplateBuilder(userId);
  BUILDERS[key](builder);
  return builder.elements;
}
