import { describe, expect, it } from 'vitest';
import { chartDataToText, parseChartData, parseNumber, SAMPLE_CHART_TEXT } from './parse';
import { chartScene, formatValue, niceStep } from './scene';

describe('данные диаграммы из текста', () => {
  it('вставка из таблицы: заголовки рядов и подписи категорий', () => {
    const data = parseChartData(SAMPLE_CHART_TEXT);
    expect(data?.labels).toEqual(['Январь', 'Февраль', 'Март', 'Апрель']);
    expect(data?.series.map((s) => s.name)).toEqual(['План', 'Факт']);
    expect(data?.series[1]?.values).toEqual([98, 150, 171, 165]);
  });

  it('CSV через точку с запятой, русские числа, кавычки', () => {
    const data = parseChartData('Город;Выручка\n"Москва; центр";1 234,5\nКазань;12%');
    expect(data?.labels).toEqual(['Москва; центр', 'Казань']);
    expect(data?.series[0]?.values).toEqual([1234.5, 12]);
  });

  it('без заголовка и один столбец', () => {
    expect(parseChartData('a,1\nb,2')?.series[0]?.name).toBe('Ряд 1');
    expect(parseChartData('5\n7\n9')?.labels).toEqual(['1', '2', '3']);
    expect(parseChartData('   ')).toBeNull();
  });

  it('числа и обратное преобразование', () => {
    expect(parseNumber('1.234,5', ';')).toBe(1234.5);
    expect(parseNumber('-3,25', '\t')).toBe(-3.25);
    expect(parseNumber('abc', ',')).toBeNull();
    const text = chartDataToText(parseChartData(SAMPLE_CHART_TEXT)!);
    expect(parseChartData(text)?.series[0]?.values).toEqual([120, 140, 160, 180]);
  });
});

describe('раскладка диаграммы', () => {
  const data = {
    chartType: 'column' as const,
    title: 'Продажи',
    labels: ['A', 'B', 'C'],
    series: [{ name: 'Ряд', color: '#9b6bdf', values: [10, -5, 30] }],
    showLegend: true,
    showValues: true,
  };

  it('столбцы: по прямоугольнику на значение, отрицательные — вниз от нуля', () => {
    const scene = chartScene(data, 400, 300);
    const bars = scene.filter((p) => p.t === 'rect' && p.fill === '#9b6bdf');
    expect(bars).toHaveLength(3);
    const [a, b] = bars as Array<{ y: number; h: number }>;
    expect(b!.y).toBeGreaterThan(a!.y);
    expect(scene.some((p) => p.t === 'text' && p.text === 'Продажи')).toBe(true);
  });

  it('круговая: сектора покрывают полный круг, легенда по категориям', () => {
    const scene = chartScene(
      { ...data, chartType: 'donut', series: [{ ...data.series[0]!, values: [1, 1, 2] }] },
      400,
      300,
    );
    const arcs = scene.filter((p) => p.t === 'arc') as Array<{ start: number; end: number }>;
    const sweep = arcs.reduce((sum, a) => sum + (a.end - a.start), 0);
    expect(sweep).toBeCloseTo(Math.PI * 2);
    expect(scene.filter((p) => p.t === 'text' && ['A', 'B', 'C'].includes(p.text))).toHaveLength(3);
  });

  it('шаг шкалы и подписи чисел', () => {
    expect(niceStep(100, 4)).toBe(25);
    expect(niceStep(7, 4)).toBe(2);
    expect(formatValue(1_500_000)).toBe('1,5 млн');
    expect(formatValue(25_000)).toBe('25 тыс');
  });
});
