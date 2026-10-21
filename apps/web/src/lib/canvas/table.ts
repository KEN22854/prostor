import { TABLE_LIMITS, tableCellKey, type TableElement } from '@prostor/shared';
import { toLocal } from '@/lib/canvas/geometry';
import type { Point } from '@/lib/canvas/viewport';

/**
 * Таблица на доске. Размеры столбцов и строк хранятся долями (сумма — 1),
 * поэтому растягивание таблицы рамкой трансформации масштабирует сетку
 * без пересчёта полей. Ячейки — отдельные поля Y.Map ("cell:r:c").
 */

export const TABLE_CELL_PADDING = 8;
export const TABLE_DEFAULT = { rows: 3, cols: 3, cellWidth: 140, cellHeight: 44 } as const;

export type TablePatch = Record<string, unknown>;

/** Нормализованные доли (защита от испорченных данных: длина, ноль, сумма) */
function fractions(values: readonly number[] | undefined, count: number): number[] {
  const list = Array.from({ length: count }, (_, i) => {
    const v = values?.[i];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 1;
  });
  const sum = list.reduce((a, b) => a + b, 0);
  return list.map((v) => v / sum);
}

export interface TableLayout {
  /** Левые границы столбцов (+ правая граница таблицы последним элементом), локальные координаты */
  xs: number[];
  ys: number[];
}

export function tableLayout(
  el: Pick<TableElement, 'width' | 'height' | 'rows' | 'cols' | 'colWidths' | 'rowHeights'>,
): TableLayout {
  const cols = fractions(el.colWidths, el.cols);
  const rows = fractions(el.rowHeights, el.rows);
  const xs = [0];
  for (const f of cols) xs.push((xs[xs.length - 1] ?? 0) + f * el.width);
  const ys = [0];
  for (const f of rows) ys.push((ys[ys.length - 1] ?? 0) + f * el.height);
  return { xs, ys };
}

/** Ячейка под мировой точкой (с учётом поворота таблицы) */
export function cellAt(el: TableElement, world: Point): { row: number; col: number } | null {
  const p = toLocal(world, el.x, el.y, el.rotation);
  if (p.x < 0 || p.y < 0 || p.x > el.width || p.y > el.height) return null;
  const { xs, ys } = tableLayout(el);
  let col = 0;
  while (col < el.cols - 1 && p.x >= (xs[col + 1] ?? Infinity)) col++;
  let row = 0;
  while (row < el.rows - 1 && p.y >= (ys[row + 1] ?? Infinity)) row++;
  return { row, col };
}

/** Прямоугольник ячейки в локальных координатах таблицы */
export function cellRect(el: TableElement, row: number, col: number) {
  const { xs, ys } = tableLayout(el);
  const x = xs[col] ?? 0;
  const y = ys[row] ?? 0;
  return { x, y, width: (xs[col + 1] ?? el.width) - x, height: (ys[row + 1] ?? el.height) - y };
}

export function cellText(el: TableElement, row: number, col: number): string {
  return el.cells?.[row]?.[col] ?? '';
}

/** Новая таблица: доли равные, ячейки пустые */
export function tableFields(rows: number, cols: number) {
  return {
    rows,
    cols,
    colWidths: Array.from({ length: cols }, () => 1 / cols),
    rowHeights: Array.from({ length: rows }, () => 1 / rows),
  };
}

/**
 * Вставка строки на место `at` (0..rows): ячейки ниже сдвигаются вниз.
 * Таблица растёт на высоту средней строки — остальные строки не сжимаются.
 */
export function insertRow(el: TableElement, at: number): TablePatch | null {
  if (el.rows >= TABLE_LIMITS.maxRows) return null;
  const rows = fractions(el.rowHeights, el.rows);
  const avg = 1 / el.rows;
  const height = el.height * (1 + avg);
  const scaled = rows.map((f) => (f * el.height) / height);
  scaled.splice(at, 0, (avg * el.height) / height);
  const patch: TablePatch = { rows: el.rows + 1, rowHeights: scaled, height };
  for (let r = el.rows; r > at; r--) {
    for (let c = 0; c < el.cols; c++)
      patch[tableCellKey(r, c)] = cellText(el, r - 1, c) || undefined;
  }
  for (let c = 0; c < el.cols; c++) patch[tableCellKey(at, c)] = undefined;
  return patch;
}

export function insertColumn(el: TableElement, at: number): TablePatch | null {
  if (el.cols >= TABLE_LIMITS.maxCols) return null;
  const cols = fractions(el.colWidths, el.cols);
  const avg = 1 / el.cols;
  const width = el.width * (1 + avg);
  const scaled = cols.map((f) => (f * el.width) / width);
  scaled.splice(at, 0, (avg * el.width) / width);
  const patch: TablePatch = { cols: el.cols + 1, colWidths: scaled, width };
  for (let r = 0; r < el.rows; r++) {
    for (let c = el.cols; c > at; c--)
      patch[tableCellKey(r, c)] = cellText(el, r, c - 1) || undefined;
    patch[tableCellKey(r, at)] = undefined;
  }
  return patch;
}

/** Удаление строки: ячейки ниже поднимаются, таблица становится ниже */
export function deleteRow(el: TableElement, at: number): TablePatch | null {
  if (el.rows <= 1 || at < 0 || at >= el.rows) return null;
  const rows = fractions(el.rowHeights, el.rows);
  const removed = rows[at] ?? 0;
  rows.splice(at, 1);
  const patch: TablePatch = {
    rows: el.rows - 1,
    rowHeights: rows.map((f) => f / (1 - removed)),
    height: el.height * (1 - removed),
  };
  for (let r = at; r < el.rows - 1; r++) {
    for (let c = 0; c < el.cols; c++)
      patch[tableCellKey(r, c)] = cellText(el, r + 1, c) || undefined;
  }
  for (let c = 0; c < el.cols; c++) patch[tableCellKey(el.rows - 1, c)] = undefined;
  return patch;
}

export function deleteColumn(el: TableElement, at: number): TablePatch | null {
  if (el.cols <= 1 || at < 0 || at >= el.cols) return null;
  const cols = fractions(el.colWidths, el.cols);
  const removed = cols[at] ?? 0;
  cols.splice(at, 1);
  const patch: TablePatch = {
    cols: el.cols - 1,
    colWidths: cols.map((f) => f / (1 - removed)),
    width: el.width * (1 - removed),
  };
  for (let r = 0; r < el.rows; r++) {
    for (let c = at; c < el.cols - 1; c++)
      patch[tableCellKey(r, c)] = cellText(el, r, c + 1) || undefined;
    patch[tableCellKey(r, el.cols - 1)] = undefined;
  }
  return patch;
}

/** Плоские поля "cell:r:c" из массива cells (для записи в Y.Map) */
export function cellsToFields(cells: readonly (readonly string[])[]): Record<string, string> {
  const fields: Record<string, string> = {};
  cells.forEach((row, r) =>
    row.forEach((text, c) => {
      if (text) fields[tableCellKey(r, c)] = text.slice(0, TABLE_LIMITS.maxCellLength);
    }),
  );
  return fields;
}

const CELL_KEY = /^cell:(\d+):(\d+)$/;

/** Обратно: поля "cell:r:c" → cells[rows][cols]; поля вне размеров игнорируются */
export function fieldsToCells(
  raw: Record<string, unknown>,
  rows: number,
  cols: number,
): string[][] {
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
  for (const [key, value] of Object.entries(raw)) {
    const m = CELL_KEY.exec(key);
    if (!m || typeof value !== 'string') continue;
    const r = Number(m[1]);
    const c = Number(m[2]);
    if (r < rows && c < cols) cells[r]![c] = value;
  }
  return cells;
}

export function isCellKey(key: string): boolean {
  return CELL_KEY.test(key);
}
