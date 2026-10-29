'use client';

import { FileUp, Import, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import type { BoardElement } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { nextZIndex } from '@/lib/canvas/element-factory';
import type { ElementStore } from '@/lib/canvas/element-store';
import { boundsOf } from '@/lib/canvas/read-element';
import { fitBounds, visibleBounds } from '@/lib/canvas/viewport';
import { placeAt, zSequence, type ImportResult } from '@/lib/import/common';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

type Source = 'excalidraw' | 'drawio' | 'mermaid' | 'stickies';

const SOURCES: Array<{ id: Source; name: string; hint: string; accept: string }> = [
  {
    id: 'drawio',
    name: 'draw.io / diagrams.net',
    hint: 'Файл .drawio или .xml',
    accept: '.drawio,.xml',
  },
  {
    id: 'excalidraw',
    name: 'Excalidraw',
    hint: 'Файл .excalidraw («Сохранить в файл»)',
    accept: '.excalidraw,.json',
  },
  {
    id: 'mermaid',
    name: 'Mermaid',
    hint: 'Код блок-схемы: flowchart TD …',
    accept: '.mmd,.md,.txt',
  },
  {
    id: 'stickies',
    name: 'Miro, Trello, список',
    hint: 'CSV-экспорт стикеров Miro или строки текста',
    accept: '.csv,.txt',
  },
];

/** Общие габариты элементов */
function boundsOfAll(elements: readonly BoardElement[]) {
  if (elements.length === 0) return null;
  const all = elements.map(boundsOf);
  return {
    minX: Math.min(...all.map((b) => b.minX)),
    minY: Math.min(...all.map((b) => b.minY)),
    maxX: Math.max(...all.map((b) => b.maxX)),
    maxY: Math.max(...all.map((b) => b.maxY)),
  };
}

/** Формат по содержимому — пользователю не нужно ничего выбирать */
function detect(text: string, fileName = ''): Source {
  const name = fileName.toLowerCase();
  if (name.endsWith('.drawio') || /<mxfile|<mxGraphModel/.test(text)) return 'drawio';
  if (name.endsWith('.excalidraw') || /"type"\s*:\s*"excalidraw/.test(text)) return 'excalidraw';
  if (/^\s*(flowchart|graph)\s/i.test(text)) return 'mermaid';
  return 'stickies';
}

interface ImportDialogProps {
  doc: Y.Doc;
  store: ElementStore;
  actions: BoardActions;
  userId: string;
  onImportPdf: () => void;
}

/**
 * Импорт из других досок: draw.io, Excalidraw, Mermaid, стикеры из Miro (CSV)
 * и любых списков. Всё создаётся одной правкой (Ctrl+Z отменяет импорт целиком)
 * и встаёт в центр экрана. PDF (Miro, FigJam и др.) — отдельной кнопкой.
 */
export function ImportDialog({ doc, store, actions, userId, onImportPdf }: ImportDialogProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const source = text.trim() ? detect(text, fileName) : null;

  async function run(content: string, name: string) {
    setBusy(true);
    try {
      const ctx = { userId, z: zSequence(nextZIndex(doc)) };
      const kind = detect(content, name);
      let result: ImportResult | null = null;
      if (kind === 'drawio')
        result = await (await import('@/lib/import/drawio')).importDrawio(content, ctx);
      else if (kind === 'excalidraw') {
        const { importExcalidraw, isExcalidraw } = await import('@/lib/import/excalidraw');
        const json: unknown = JSON.parse(content);
        result = isExcalidraw(json) ? importExcalidraw(json, ctx) : null;
      } else if (kind === 'mermaid')
        result = (await import('@/lib/import/mermaid')).importMermaid(content, ctx);
      else result = (await import('@/lib/import/stickies')).importStickies(content, ctx);

      if (!result || result.elements.length === 0) {
        toast.error(t('Не нашлось объектов для импорта — проверьте файл или текст'));
        return;
      }
      const { camera, size } = useCanvasStore.getState();
      const v = visibleBounds(camera, size);
      const center = { x: (v.minX + v.maxX) / 2, y: (v.minY + v.maxY) / 2 };
      let placed = placeAt(result.elements, center);
      // Центр экрана занят — ставим импорт справа от содержимого доски, чтобы не накрыть его
      const box = boundsOfAll(placed);
      const extent = store.extent();
      if (box && extent && store.query(box).length > 0) {
        const w = box.maxX - box.minX;
        placed = placeAt(placed, { x: extent.maxX + 160 + w / 2, y: center.y });
      }
      const ids = actions.create(placed);
      useCanvasStore.getState().select(ids);
      const target = boundsOfAll(placed);
      if (target) useCanvasStore.getState().setCamera(fitBounds(target, size, 96, 1));
      toast.success(
        result.skipped > 0
          ? t('Импортировано объектов: {n}, пропущено: {skipped} (картинки и неподдерживаемые)', {
              n: ids.length,
              skipped: result.skipped,
            })
          : t('Импортировано объектов: {n}', { n: ids.length }),
      );
      setOpen(false);
      setText('');
      setFileName('');
    } catch {
      toast.error(t('Не удалось прочитать файл — формат не распознан'));
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file: File) {
    if (file.size > 20_000_000) {
      toast.error(t('Файл больше 20 МБ'));
      return;
    }
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setOpen(false);
      onImportPdf();
      return;
    }
    const content = await file.text();
    setFileName(file.name);
    setText(content);
    await run(content, file.name);
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-xl transition-transform duration-200 hover:scale-105"
            aria-label={t('Импорт из других досок')}
            onClick={() => setOpen(true)}
          >
            <Import />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {t('Импорт: draw.io, Excalidraw, Mermaid, Miro (CSV), PDF')}
        </TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('Импорт из других досок')}</DialogTitle>
            <DialogDescription>
              {t(
                'Перетащите файл или вставьте текст — формат определится сам. Импорт отменяется одним Ctrl+Z',
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SOURCES.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'rounded-xl border p-3 transition-all duration-300',
                  source === s.id ? 'shadow-soft border-primary bg-accent' : 'bg-background',
                )}
              >
                <p className="text-sm font-medium">{s.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(s.hint)}</p>
              </div>
            ))}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void readFile(file);
            }}
            className={cn(
              'relative rounded-2xl border-2 border-dashed transition-colors',
              dragging ? 'border-primary bg-accent/60' : 'border-border',
            )}
          >
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileName('');
              }}
              placeholder={t(
                'flowchart TD\n  A[Идея] --> B{Проверка}\n  B -->|да| C[Готово]\n\nили список стикеров — по строке на стикер',
              )}
              className="h-44 resize-none border-0 bg-transparent font-mono text-xs shadow-none focus-visible:shadow-none"
              spellCheck={false}
            />
            {dragging ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-primary">
                <Upload className="mr-2 size-4" /> {t('Отпустите файл')}
              </div>
            ) : null}
          </div>

          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload /> {t('Выбрать файл')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  onImportPdf();
                }}
              >
                <FileUp /> {t('PDF (Miro, FigJam…)')}
              </Button>
            </div>
            <Button
              variant="gradient"
              disabled={!text.trim() || busy}
              onClick={() => void run(text, fileName)}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t('Импортировать')}
            </Button>
          </DialogFooter>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".drawio,.xml,.excalidraw,.json,.mmd,.md,.txt,.csv,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void readFile(file);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
