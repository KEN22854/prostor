'use client';

import { FileImage, FileText, FileType2, Loader2, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { ElementStore } from '@/lib/canvas/element-store';
import { sortFrames } from '@/lib/canvas/frames';
import { exportBoard, type ExportFormat } from '@/lib/export/export-board';
import { collectPages, type ExportScope } from '@/lib/export/export-pages';
import { apiRequest } from '@/lib/fetcher';
import { cn, errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

const FORMATS: Array<{ value: ExportFormat; label: string; hint: string; icon: LucideIcon }> = [
  { value: 'png', label: 'PNG', hint: 'Картинка для чата и презентаций', icon: FileImage },
  { value: 'pdf', label: 'PDF', hint: 'Для печати; фреймы — отдельными страницами', icon: FileText },
  { value: 'svg', label: 'SVG', hint: 'Вектор со слоями для Figma и Illustrator', icon: FileType2 },
];

interface ExportDialogProps {
  boardId: string;
  boardTitle: string;
  store: ElementStore;
  actions: BoardActions;
}

/** Экспорт доски, выделения или фреймов. Файл собирается в браузере. */
export function ExportDialog({ boardId, boardTitle, store, actions }: ExportDialogProps) {
  const open = useCanvasStore((s) => s.panel === 'export');
  const setPanel = useCanvasStore((s) => s.setPanel);
  const selection = useCanvasStore((s) => s.selection);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [scopeKey, setScopeKey] = useState<string>('board');
  const [scale, setScale] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Список фреймов на момент открытия (диалог модальный — доска под ним не меняется у нас)
  const frames = useMemo(() => (open ? sortFrames(store.frames()) : []), [open, store]);
  const effectiveScope = scopeKey === 'frames' && format !== 'pdf' ? 'board' : scopeKey;

  const scope = (): ExportScope => {
    if (effectiveScope === 'selection') return { kind: 'selection', ids: selection };
    if (effectiveScope === 'frames') return { kind: 'frames' };
    if (effectiveScope.startsWith('frame:')) return { kind: 'frame', id: effectiveScope.slice(6) };
    return { kind: 'board' };
  };

  async function run() {
    const s = scope();
    const pages = collectPages(store, s, boardTitle, (ids) => actions.withFrameChildren(ids));
    if (pages.length === 0) {
      toast.error('Нечего экспортировать — доска или выделение пусты');
      return;
    }
    setBusy(true);
    try {
      // Сервер проверяет запрет организации на экспорт и пишет аудит
      await apiRequest(`/api/boards/${boardId}/exports`, {
        method: 'POST',
        body: { format, scope: s.kind, pages: pages.length },
      });
      const name = pages.length === 1 ? (pages[0]?.name ?? boardTitle) : boardTitle;
      await exportBoard({
        format,
        pages,
        scale,
        background: transparent && format !== 'pdf' ? null : '#ffffff',
        fileName: name,
      });
      toast.success('Файл готов');
      setPanel(null);
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось экспортировать доску'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && setPanel(v ? 'export' : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Экспорт</DialogTitle>
          <DialogDescription>Файл создаётся в браузере и сразу скачивается.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div role="radiogroup" aria-label="Формат" className="grid grid-cols-3 gap-2">
            {FORMATS.map(({ value, label, hint, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={format === value}
                title={hint}
                onClick={() => setFormat(value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors',
                  format === value ? 'border-primary bg-accent/50' : 'hover:bg-muted',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{FORMATS.find((f) => f.value === format)?.hint}</p>

          <div className="space-y-1.5">
            <Label htmlFor="export-scope">Что экспортировать</Label>
            <NativeSelect id="export-scope" value={effectiveScope} onChange={(e) => setScopeKey(e.target.value)}>
              <option value="board">Всю доску</option>
              {selection.length > 0 ? <option value="selection">Выделенное ({selection.length})</option> : null}
              {format === 'pdf' && frames.length > 0 ? (
                <option value="frames">Все фреймы — по странице ({frames.length})</option>
              ) : null}
              {frames.map((f) => (
                <option key={f.id} value={`frame:${f.id}`}>
                  Фрейм «{f.title || 'Без названия'}»
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {format === 'png' ? (
              <div className="space-y-1.5">
                <Label htmlFor="export-scale">Масштаб</Label>
                <NativeSelect id="export-scale" value={String(scale)} onChange={(e) => setScale(Number(e.target.value))}>
                  <option value="1">1×</option>
                  <option value="2">2× (рекомендуется)</option>
                  <option value="4">4×</option>
                </NativeSelect>
              </div>
            ) : null}
            {format !== 'pdf' ? (
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
                Прозрачный фон
              </label>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setPanel(null)} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Скачать {format.toUpperCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
