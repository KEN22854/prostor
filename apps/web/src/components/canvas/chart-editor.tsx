'use client';

import type * as Y from 'yjs';
import type { ChartElement } from '@prostor/shared';
import { ChartDialog, type ChartDialogResult } from '@/components/canvas/chart-dialog';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildChart, CHART_DEFAULT, nextZIndex } from '@/lib/canvas/element-factory';
import type { ElementStore } from '@/lib/canvas/element-store';
import { visibleBounds } from '@/lib/canvas/viewport';
import { useCanvasStore } from '@/stores/canvas-store';

/** Создание и правка диаграмм: состояние — chartEditor в сторе холста */
export function ChartEditor({
  store,
  actions,
  doc,
  userId,
}: {
  store: ElementStore;
  actions: BoardActions;
  doc: Y.Doc;
  userId: string;
}) {
  const target = useCanvasStore((s) => s.chartEditor);
  const setTarget = useCanvasStore((s) => s.setChartEditor);
  const existing = target && target !== 'new' ? store.get(target) : undefined;
  const chart = existing?.type === 'chart' ? (existing as ChartElement) : null;

  const submit = (data: ChartDialogResult) => {
    if (chart) {
      actions.update(new Map([[chart.id, { ...data }]]));
      return;
    }
    const { camera, size } = useCanvasStore.getState();
    const v = visibleBounds(camera, size);
    const el = buildChart({
      ...data,
      x: (v.minX + v.maxX) / 2 - CHART_DEFAULT.width / 2,
      y: (v.minY + v.maxY) / 2 - CHART_DEFAULT.height / 2,
      userId,
      zIndex: nextZIndex(doc),
    });
    const created = actions.create([
      { ...el, showLegend: data.showLegend, showValues: data.showValues },
    ]);
    useCanvasStore.getState().select(created);
  };

  return (
    <ChartDialog
      open={target === 'new' || chart !== null}
      onOpenChange={(open) => !open && setTarget(null)}
      initial={chart}
      onSubmit={submit}
    />
  );
}
