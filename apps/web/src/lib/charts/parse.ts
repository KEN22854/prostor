import { CHART_LIMITS, type ChartElement } from '@prostor/shared';
import { CHART_COLORS } from '@/lib/charts/scene';

/**
 * Данные диаграммы из текста: вставка из Excel / Google Таблиц (табуляция),
 * CSV через «;» или «,». Первая строка — заголовки рядов, первый столбец —
 * подписи категорий. Числа понимаются и по-русски: «1 234,5», «12%».
 */
export interface ParsedChartData {
  labels: string[];
  series: ChartElement['series'];
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5).join('\n');
  if (sample.includes('\t')) return '\t';
  const semi = (sample.match(/;/g) ?? []).length;
  const comma = (sample.match(/,/g) ?? []).length;
  return semi >= comma && semi > 0 ? ';' : ',';
}

/** Строка CSV с кавычками («"Москва, центр";12») */
function splitRow(line: string, delimiter: string): string[] {
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
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/** «1 234,5» → 1234.5; «12%» → 12; не число → null */
export function parseNumber(raw: string, delimiter: string): number | null {
  let s = raw.replace(/[\s %₽$€]/g, '');
  if (!s) return null;
  // При разделителе «,» запятая в числе может быть только десятичной в кавычках —
  // «1,5» там уже без кавычек; в остальных случаях запятая — десятичная
  if (delimiter !== ',' || /^-?\d+,\d+$/.test(s)) {
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export function parseChartData(text: string): ParsedChartData | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() !== '');
  if (lines.length === 0) return null;
  const delimiter = detectDelimiter(lines);
  const rows = lines.map((l) => splitRow(l, delimiter));
  const width = Math.max(...rows.map((r) => r.length));
  if (width < 2) {
    // Один столбец чисел — категории «1, 2, 3…»
    const values = rows
      .map((r) => parseNumber(r[0] ?? '', delimiter))
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return {
      labels: values.map((_, i) => String(i + 1)),
      series: [{ name: 'Ряд 1', color: CHART_COLORS[0]!, values }],
    };
  }

  // Первая строка — заголовок, если во втором столбце не число
  const header = parseNumber(rows[0]![1] ?? '', delimiter) === null;
  const names = header
    ? rows[0]!.slice(1, width)
    : Array.from({ length: width - 1 }, (_, i) => `Ряд ${i + 1}`);
  const body = (header ? rows.slice(1) : rows).slice(0, CHART_LIMITS.maxLabels);
  if (body.length === 0) return null;

  const labels = body.map((r, i) => (r[0] ?? '').slice(0, 100) || String(i + 1));
  const series = names.slice(0, CHART_LIMITS.maxSeries).map((name, si) => ({
    name: (name || `Ряд ${si + 1}`).slice(0, 100),
    color: CHART_COLORS[si % CHART_COLORS.length]!,
    values: body.map((r) => parseNumber(r[si + 1] ?? '', delimiter) ?? 0),
  }));
  return { labels, series };
}

/** Данные диаграммы обратно в текст (для редактирования) — через табуляцию */
export function chartDataToText(data: ParsedChartData): string {
  const header = ['', ...data.series.map((s) => s.name)].join('\t');
  const rows = data.labels.map((label, i) =>
    [label, ...data.series.map((s) => String(s.values[i] ?? 0).replace('.', ','))].join('\t'),
  );
  return [header, ...rows].join('\n');
}

export const SAMPLE_CHART_TEXT = [
  '\tПлан\tФакт',
  'Январь\t120\t98',
  'Февраль\t140\t150',
  'Март\t160\t171',
  'Апрель\t180\t165',
].join('\n');
