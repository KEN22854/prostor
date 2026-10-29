import { STICKY_COLORS } from '@/stores/canvas-store';
import { buildSticky, STICKY_SIZE } from '@/lib/canvas/element-factory';
import type { ImportContext, ImportResult } from '@/lib/import/common';

/**
 * Список идей → стикеры сеткой. Подходит для экспорта стикеров из Miro
 * (CSV: «Content», «Color»…), из Trello/Notion, или просто строк текста.
 */
const COLOR_NAMES: Record<string, string> = {
  yellow: '#fef08a',
  light_yellow: '#fef9c3',
  orange: '#fed7aa',
  light_green: '#bbf7d0',
  green: '#bbf7d0',
  cyan: '#a5f3fc',
  light_blue: '#bfdbfe',
  blue: '#bfdbfe',
  violet: '#ddd6fe',
  purple: '#ddd6fe',
  light_pink: '#fbcfe8',
  pink: '#fbcfe8',
  red: '#fecaca',
  gray: '#e5e7eb',
  black: '#e5e7eb',
};

function splitCsv(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/** Записи с текстом и (если есть) цветом */
export function parseStickyList(text: string): Array<{ text: string; color?: string }> {
  // Многострочные ячейки CSV в кавычках склеиваем обратно
  const rows: string[] = [];
  let buffer = '';
  for (const line of text.split(/\r?\n/)) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    if ((buffer.match(/"/g) ?? []).length % 2 === 0) {
      rows.push(buffer);
      buffer = '';
    }
  }
  if (buffer) rows.push(buffer);
  const nonEmpty = rows.filter((r) => r.trim());
  if (nonEmpty.length === 0) return [];
  const delimiter = nonEmpty[0]!.includes('\t') ? '\t' : nonEmpty[0]!.includes(';') ? ';' : ',';
  const header = splitCsv(nonEmpty[0]!, delimiter).map((h) => h.toLowerCase());
  const contentCol = header.findIndex((h) =>
    /^(content|text|текст|содержимое|title|название)$/.test(h),
  );
  if (contentCol === -1) {
    // Не CSV с заголовком — каждая строка (или «- пункт») — отдельный стикер
    return nonEmpty
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
      .filter(Boolean)
      .map((t) => ({ text: t }));
  }
  const colorCol = header.findIndex((h) => /^(color|colour|цвет)$/.test(h));
  return nonEmpty.slice(1).flatMap((row) => {
    const cells = splitCsv(row, delimiter);
    const value = (cells[contentCol] ?? '').trim();
    if (!value) return [];
    const colorName = (cells[colorCol] ?? '').toLowerCase().replace(/\s+/g, '_');
    return [{ text: value, color: COLOR_NAMES[colorName] }];
  });
}

export function importStickies(text: string, ctx: ImportContext): ImportResult | null {
  const items = parseStickyList(text).slice(0, 500);
  if (items.length === 0) return null;
  const cols = Math.ceil(Math.sqrt(items.length));
  const gap = 24;
  const elements = items.map((item, i) =>
    buildSticky({
      x: (i % cols) * (STICKY_SIZE + gap),
      y: Math.floor(i / cols) * (STICKY_SIZE + gap),
      text: item.text.slice(0, 10_000),
      fill: item.color ?? STICKY_COLORS[i % STICKY_COLORS.length]!,
      userId: ctx.userId,
      zIndex: ctx.z(),
    }),
  );
  return { elements, skipped: 0 };
}
