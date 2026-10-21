'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { IMAGE_ASPECTS, type AiJobDto, type ImageAspect } from '@prostor/shared';
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
import { useAiJob } from '@/hooks/use-ai-job';
import type { BoardActions } from '@/lib/canvas/board-actions';
import { buildImage, nextZIndex } from '@/lib/canvas/element-factory';
import { displaySize } from '@/lib/canvas/image-upload';
import { visibleBounds } from '@/lib/canvas/viewport';
import { ApiClientError, apiRequest } from '@/lib/fetcher';
import { cn, errorMessage } from '@/lib/utils';
import { useAiStore } from '@/stores/ai-store';
import { useCanvasStore } from '@/stores/canvas-store';
import { useT } from '@/lib/i18n/client';

const ASPECT_LABEL: Record<ImageAspect, string> = {
  '1:1': 'Квадрат',
  '16:9': 'Широкий',
  '9:16': 'Вертикальный',
  '4:3': '4:3',
  '3:4': '3:4',
};

/** Размер места под картинку до получения результата (мировые единицы) */
function placeholderSize(aspect: ImageAspect): { width: number; height: number } {
  const [w, h] = aspect.split(':').map(Number) as [number, number];
  return displaySize(w * 100, h * 100, 480);
}

interface GenerateImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  doc: Y.Doc | null;
  actions: BoardActions | null;
  userId: string | null;
}

/**
 * Генерация изображения по описанию. Диалог закрывается сразу после
 * постановки задачи: картинка появится на месте индикатора в центре экрана,
 * а пользователь продолжает работать.
 */
export function GenerateImageDialog({
  open,
  onOpenChange,
  boardId,
  doc,
  actions,
  userId,
}: GenerateImageDialogProps) {
  const t = useT();
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<ImageAspect>('1:1');
  const [submitting, setSubmitting] = useState(false);
  const runJob = useAiJob();

  async function submit() {
    if (!doc || !actions?.canEdit || !userId) return;
    const text = prompt.trim();
    if (text.length < 3) {
      toast.error(t('Опишите изображение подробнее'));
      return;
    }
    const { camera, size } = useCanvasStore.getState();
    const view = visibleBounds(camera, size);
    const ph = placeholderSize(aspect);
    const cx = (view.minX + view.maxX) / 2;
    const cy = (view.minY + view.maxY) / 2;
    const bounds = {
      minX: cx - ph.width / 2,
      minY: cy - ph.height / 2,
      maxX: cx + ph.width / 2,
      maxY: cy + ph.height / 2,
    };

    setSubmitting(true);
    let key: string | null = null;
    try {
      const job = await runJob(
        async () => {
          const created = await apiRequest<AiJobDto>('/api/ai/generate-image', {
            method: 'POST',
            body: { boardId, prompt: text, aspect },
          });
          // Задача принята — закрываем диалог, дальше индикатор на доске
          key = `generate:${created.id}`;
          useAiStore
            .getState()
            .start({ key, label: 'Генерируем', progress: created.progress, bounds });
          setSubmitting(false);
          onOpenChange(false);
          setPrompt('');
          return created;
        },
        (j) => {
          if (key) useAiStore.getState().progress(key, j.progress);
        },
      );
      if (job.status !== 'SUCCEEDED' || !job.result) {
        toast.error(job.error ?? t('Не удалось сгенерировать изображение'));
        return;
      }
      const shown = displaySize(job.result.width, job.result.height, 480);
      const el = buildImage({
        x: cx - shown.width / 2,
        y: cy - shown.height / 2,
        width: shown.width,
        height: shown.height,
        naturalWidth: job.result.width,
        naturalHeight: job.result.height,
        assetId: job.result.assetId,
        alt: text.slice(0, 500),
        userId,
        zIndex: nextZIndex(doc),
      });
      useCanvasStore.getState().select(actions.create([el]));
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : errorMessage(error, t('Не удалось сгенерировать изображение')),
      );
    } finally {
      setSubmitting(false);
      if (key) useAiStore.getState().finish(key);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden />{' '}
            {t('Сгенерировать изображение')}
          </DialogTitle>
          <DialogDescription>
            Опишите, что должно быть на картинке. Она появится в центре экрана.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="ai-prompt">{t('Описание')}</Label>
            <textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
              }}
              maxLength={1000}
              rows={4}
              autoFocus
              placeholder={t('Например: уютный офис с растениями, акварель')}
              className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('Формат')}</Label>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {IMAGE_ASPECTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={aspect === a}
                  onClick={() => setAspect(a)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-xs transition-colors',
                    aspect === a
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  {ASPECT_LABEL[a]} <span className="text-muted-foreground">{a}</span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('Отмена')}
            </Button>
            <Button type="submit" disabled={submitting || prompt.trim().length < 3}>
              {submitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {t('Сгенерировать')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
