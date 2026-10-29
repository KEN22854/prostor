'use client';

import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartPie,
  Donut,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartElement, ChartType } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { chartDataToText, parseChartData, SAMPLE_CHART_TEXT } from '@/lib/charts/parse';
import { chartScene, chartSceneToSvg } from '@/lib/charts/scene';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

const TYPES: Array<{ type: ChartType; icon: LucideIcon; label: string }> = [
  { type: 'column', icon: ChartColumn, label: 'Столбцы' },
  { type: 'bar', icon: ChartBar, label: 'Полосы' },
  { type: 'line', icon: ChartLine, label: 'Линии' },
  { type: 'area', icon: ChartArea, label: 'Области' },
  { type: 'pie', icon: ChartPie, label: 'Круговая' },
  { type: 'donut', icon: Donut, label: 'Кольцевая' },
];

export type ChartDialogResult = Pick<
  ChartElement,
  'chartType' | 'title' | 'labels' | 'series' | 'showLegend' | 'showValues'
>;

interface ChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Диаграмма для правки; null — новая */
  initial: ChartElement | null;
  onSubmit: (data: ChartDialogResult) => void;
}

/**
 * Диаграмма из данных: вставьте таблицу из Excel / Google Таблиц или CSV,
 * выберите вид — предпросмотр обновляется сразу. Цвета рядов сохраняются при правке.
 */
export function ChartDialog({ open, onOpenChange, initial, onSubmit }: ChartDialogProps) {
  const t = useT();
  const [type, setType] = useState<ChartType>('column');
  const [title, setTitle] = useState('');
  const [text, setText] = useState(SAMPLE_CHART_TEXT);
  const [showValues, setShowValues] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setType(initial?.chartType ?? 'column');
    setTitle(initial?.title ?? '');
    setText(initial ? chartDataToText(initial) : SAMPLE_CHART_TEXT);
    setShowValues(initial?.showValues ?? false);
    setShowLegend(initial?.showLegend ?? true);
  }, [open, initial]);

  const parsed = useMemo(() => {
    const data = parseChartData(text);
    if (!data || !initial) return data;
    // При правке ряды с теми же именами сохраняют свои цвета
    return {
      ...data,
      series: data.series.map((s, i) => ({
        ...s,
        color:
          initial.series.find((o) => o.name === s.name)?.color ??
          initial.series[i]?.color ??
          s.color,
      })),
    };
  }, [text, initial]);

  const result: ChartDialogResult | null = parsed
    ? { chartType: type, title: title.trim(), showValues, showLegend, ...parsed }
    : null;
  const preview = useMemo(
    () =>
      result ? chartSceneToSvg(chartScene(result, 480, 300), 'Inter, system-ui, sans-serif') : '',
    // eslint-disable-next-line react-hooks/exhaustive-deps -- result пересобирается из этих полей
    [parsed, type, title, showValues, showLegend],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? t('Данные диаграммы') : t('Диаграмма из данных')}</DialogTitle>
          <DialogDescription>
            {t(
              'Вставьте таблицу из Excel или Google Таблиц, или CSV: первая строка — названия рядов, первый столбец — подписи',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-3">
            <div
              className="grid grid-cols-6 gap-1"
              role="radiogroup"
              aria-label={t('Вид диаграммы')}
            >
              {TYPES.map(({ type: value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={type === value}
                  title={t(label)}
                  onClick={() => setType(value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border p-2 text-[10px] transition-all duration-200 hover:-translate-y-px',
                    type === value
                      ? 'shadow-soft border-primary bg-accent text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-5" />
                  {t(label)}
                </button>
              ))}
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('Название (необязательно)')}
              maxLength={200}
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-48 font-mono text-xs"
              spellCheck={false}
              aria-label={t('Данные')}
            />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showValues}
                  onChange={(e) => setShowValues(e.target.checked)}
                />
                {t('Подписи значений')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={(e) => setShowLegend(e.target.checked)}
                />
                {t('Легенда')}
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => fileRef.current?.click()}
              >
                <FileSpreadsheet /> {t('Из CSV-файла')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file && file.size < 2_000_000) void file.text().then(setText);
                }}
              />
            </div>
          </div>
          <div className="flex min-h-64 items-center justify-center rounded-2xl border bg-white p-2">
            {result ? (
              <svg
                viewBox="0 0 480 300"
                className="h-auto w-full animate-appear"
                key={type}
                // Разметка собрана из наших примитивов, текст экранирован
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('Не удалось разобрать данные — нужна хотя бы одна строка с числом')}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Отмена')}
          </Button>
          <Button
            variant="gradient"
            disabled={!result}
            onClick={() => {
              if (!result) return;
              onSubmit(result);
              onOpenChange(false);
            }}
          >
            {initial ? t('Сохранить') : t('Добавить на доску')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
