'use client';

import { ChevronLeft, ChevronRight, Megaphone, MegaphoneOff, NotebookText, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type { FrameElement } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import type { BoardActions } from '@/lib/canvas/board-actions';
import type { ElementStore } from '@/lib/canvas/element-store';
import { sortFrames } from '@/lib/canvas/frames';
import { boundsOf } from '@/lib/canvas/read-element';
import { fitBounds } from '@/lib/canvas/viewport';
import { closeEnough, lerpCamera } from '@/lib/presence/follow';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { useT } from '@/lib/i18n/client';

/** Слайд занимает экран почти целиком: небольшой отступ и любой нужный масштаб */
const SLIDE_PADDING = 16;
const SLIDE_MAX_ZOOM = 8;

/** Начать показ с фрейма (или с первого). false — на доске нет фреймов */
export function startPresentation(store: ElementStore, fromFrameId?: string): boolean {
  const frames = sortFrames(store.frames());
  if (frames.length === 0) return false;
  const index = Math.max(0, fromFrameId ? frames.findIndex((f) => f.id === fromFrameId) : 0);
  const s = useCanvasStore.getState();
  s.select([]);
  s.setEditing(null);
  s.setPresentation({ index, notes: false });
  return true;
}

interface PresentationModeProps {
  store: ElementStore | null;
  actions: BoardActions | null;
  awareness: Awareness | null;
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Режим презентации: слайды — фреймы доски в порядке презентации.
 *
 * - Весь экран (Fullscreen API на области холста), камера плавно
 *   переезжает к фрейму и вписывает его.
 * - Управление: →/Space/PageDown/клик — дальше, ←/PageUp — назад,
 *   Home/End, N — заметки докладчика, Esc — выход.
 * - «Все за мной» — тот же механизм, что «позвать всех за собой»
 *   (awareness.presenting): камеры участников следуют за ведущим.
 * - Холст под прозрачным слоем не получает указатель: в показе нельзя
 *   случайно сдвинуть объект или панорамировать.
 */
export function PresentationMode({
  store,
  actions,
  awareness,
  containerRef,
}: PresentationModeProps) {
  const t = useT();
  const presentation = useCanvasStore((s) => s.presentation);
  const size = useCanvasStore((s) => s.size);
  const shieldRef = useRef<HTMLDivElement>(null);
  const [leading, setLeading] = useState(false);
  useSyncExternalStore(
    presentation && store ? store.subscribe : noopSubscribe,
    store?.getVersion ?? zero,
    zero,
  );

  const frames: FrameElement[] = presentation && store ? sortFrames(store.frames()) : [];
  const index = presentation ? Math.min(presentation.index, Math.max(0, frames.length - 1)) : 0;
  const frame = frames[index];

  // Полный экран на время показа; выход из него (Esc браузера) завершает показ
  useEffect(() => {
    if (!presentation) return;
    const el = containerRef.current;
    if (el && !document.fullscreenElement) void el.requestFullscreen?.().catch(() => undefined);
    const onChange = () => {
      if (!document.fullscreenElement) useCanvasStore.getState().setPresentation(null);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
    // Только при входе/выходе, не на каждую смену слайда
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(presentation), containerRef]);

  // Выход из показа: снять полный экран и «все за мной»
  useEffect(() => {
    if (presentation) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    if (leading) {
      awareness?.setLocalStateField('presenting', null);
      setLeading(false);
    }
  }, [presentation, leading, awareness]);

  // Плавный переезд камеры к слайду (и перевписывание при смене размера экрана)
  useEffect(() => {
    if (!presentation || !frame) return;
    const target = fitBounds(boundsOf(frame), size, SLIDE_PADDING, SLIDE_MAX_ZOOM);
    let raf = 0;
    const step = () => {
      const { camera, setCamera } = useCanvasStore.getState();
      if (closeEnough(camera, target)) {
        setCamera(target);
        return;
      }
      setCamera(lerpCamera(camera, target, 0.22));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [presentation, frame, size]);

  // Клавиши показа (в фазе захвата — раньше горячих клавиш доски)
  useEffect(() => {
    if (!presentation) return;
    const go = (delta: number) => {
      const p = useCanvasStore.getState().presentation;
      if (!p) return;
      const next = Math.max(0, Math.min(frames.length - 1, p.index + delta));
      useCanvasStore.getState().setPresentation({ ...p, index: next });
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('textarea, input')) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      const p = useCanvasStore.getState().presentation;
      if (!p) return;
      let handled = true;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
        case 'Enter':
          go(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          go(-1);
          break;
        case 'Home':
          useCanvasStore.getState().setPresentation({ ...p, index: 0 });
          break;
        case 'End':
          useCanvasStore.getState().setPresentation({ ...p, index: frames.length - 1 });
          break;
        case 'n':
        case 'N':
        case 'т':
        case 'Т':
          useCanvasStore.getState().setPresentation({ ...p, notes: !p.notes });
          break;
        case 'Escape':
          useCanvasStore.getState().setPresentation(null);
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [presentation, frames.length]);

  // Щит над холстом: нативные обработчики, чтобы события не дошли до слушателей холста
  useEffect(() => {
    const shield = shieldRef.current;
    if (!shield) return;
    const stop = (e: Event) => {
      e.stopPropagation();
      if (e.type === 'wheel') e.preventDefault();
    };
    const types = ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'dblclick', 'contextmenu'];
    for (const type of types) shield.addEventListener(type, stop, { passive: false });
    return () => {
      for (const type of types) shield.removeEventListener(type, stop);
    };
  }, [presentation]);

  if (!presentation || !store) return null;

  const setIndex = (i: number) =>
    useCanvasStore.getState().setPresentation({
      ...presentation,
      index: Math.max(0, Math.min(frames.length - 1, i)),
    });
  const toggleLead = () => {
    const next = !leading;
    awareness?.setLocalStateField('presenting', next ? { since: Date.now() } : null);
    setLeading(next);
  };

  return (
    <div className="absolute inset-0 z-30" data-testid="presentation">
      <div
        ref={shieldRef}
        className="absolute inset-0 cursor-pointer"
        aria-hidden
        onClick={(e) => setIndex(index + (e.shiftKey ? -1 : 1))}
      />

      {presentation.notes && frame ? (
        <SpeakerNotes key={frame.id} frame={frame} actions={actions} />
      ) : null}

      <div
        className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-background/90 p-1 text-sm shadow-lg backdrop-blur"
        role="toolbar"
        aria-label={t('Управление презентацией')}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('Предыдущий слайд')}
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-28 px-1 text-center" data-testid="slide-counter">
          {frames.length > 0 ? `${index + 1} / ${frames.length}` : t('Нет слайдов')}
          {frame?.title ? (
            <span className="ml-2 inline-block max-w-48 truncate align-bottom text-muted-foreground">
              {frame.title}
            </span>
          ) : null}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('Следующий слайд')}
          disabled={index >= frames.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          <ChevronRight />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-8', presentation.notes && 'bg-accent')}
          aria-pressed={presentation.notes}
          onClick={() =>
            useCanvasStore
              .getState()
              .setPresentation({ ...presentation, notes: !presentation.notes })
          }
        >
          <NotebookText /> {t('Заметки')}
        </Button>
        {awareness ? (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8',
              leading && 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
            aria-pressed={leading}
            onClick={toggleLead}
          >
            {leading ? <MegaphoneOff /> : <Megaphone />}
            {leading ? t('Все следуют') : t('Все за мной')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('Завершить показ')}
          onClick={() => useCanvasStore.getState().setPresentation(null)}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

/**
 * Заметки докладчика к текущему слайду. Редактор правит их прямо в показе;
 * запись в Yjs — по blur (как название фрейма), чтобы не плодить шаги отмены.
 */
function SpeakerNotes({ frame, actions }: { frame: FrameElement; actions: BoardActions | null }) {
  const t = useT();
  const [value, setValue] = useState(frame.speakerNotes ?? '');
  useEffect(() => setValue(frame.speakerNotes ?? ''), [frame.speakerNotes]);
  const editable = Boolean(actions?.canEdit) && !frame.locked;

  const commit = () => {
    const notes = value.slice(0, 20_000);
    if (notes !== (frame.speakerNotes ?? '')) {
      actions?.update(new Map([[frame.id, { speakerNotes: notes || undefined }]]));
    }
  };

  return (
    <aside
      className="absolute bottom-20 right-4 top-4 flex w-80 flex-col gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur"
      aria-label={t('Заметки докладчика')}
    >
      <h2 className="text-sm font-medium">{t('Заметки докладчика')}</h2>
      {editable ? (
        <textarea
          className="flex-1 resize-none rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t('Что сказать на этом слайде…')}
          value={value}
          maxLength={20_000}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <p className="flex-1 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
          {value || 'Заметок к этому слайду нет'}
        </p>
      )}
    </aside>
  );
}

const noopSubscribe = () => () => undefined;
const zero = () => 0;
