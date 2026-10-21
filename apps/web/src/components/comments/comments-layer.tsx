'use client';

import { MessageCircle } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { colorForUser, initials, type CommentThreadDto } from '@prostor/shared';
import { CommentComposer } from '@/components/comments/comment-composer';
import { ThreadCard } from '@/components/comments/thread-card';
import type { ElementStore } from '@/lib/canvas/element-store';
import { centerOn, worldToScreen, type Point } from '@/lib/canvas/viewport';
import { markThreadRead, postComment } from '@/lib/comments-api';
import { cn, errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { useCommentsStore } from '@/stores/comments-store';

interface CommentsLayerProps {
  boardId: string;
  store: ElementStore | null;
  canComment: boolean;
}

/** Точка пина: правый верхний угол объекта (едет вместе с ним) или сохранённая точка */
function anchorOf(thread: CommentThreadDto, store: ElementStore | null): Point | null {
  if (thread.elementId) {
    const el = store?.get(thread.elementId);
    if (el) return { x: el.x + el.width, y: el.y };
  }
  return thread.x !== null && thread.y !== null ? { x: thread.x, y: thread.y } : null;
}

const noop = () => () => undefined;
const zero = () => 0;

/**
 * Пины комментариев поверх холста (HTML, а не Konva: в карточке — поля ввода,
 * меню и реакции). Пинов на доске десятки, поэтому перерисовка слоя на каждое
 * движение камеры дешёвая.
 */
export function CommentsLayer({ boardId, store, canComment }: CommentsLayerProps) {
  const camera = useCanvasStore((s) => s.camera);
  const size = useCanvasStore((s) => s.size);
  const { threads, visible, showResolved, openThreadId, draft, openThread, startDraft } =
    useCommentsStore();
  // Объекты двигаются — пины едут за ними
  useSyncExternalStore(store?.subscribe ?? noop, store?.getVersion ?? zero, zero);

  const open = threads.find((t) => t.id === openThreadId) ?? null;

  // Открыли тред (из панели, уведомления, письма) — его уведомления прочитаны
  useEffect(() => {
    if (openThreadId) markThreadRead(openThreadId);
  }, [openThreadId]);

  // Пин открытого треда за краем экрана — центрируем камеру на нём (один раз на открытие)
  const openFound = Boolean(open);
  useEffect(() => {
    if (!openThreadId || !openFound) return;
    const thread = useCommentsStore.getState().threads.find((t) => t.id === openThreadId);
    const anchor = thread ? anchorOf(thread, store) : null;
    if (!anchor) return;
    const { camera: cam, size: s, setCamera } = useCanvasStore.getState();
    const p = worldToScreen(cam, anchor);
    if (p.x < 40 || p.y < 40 || p.x > s.width - 360 || p.y > s.height - 40) {
      setCamera(centerOn(cam, s, { x: anchor.x + 160 / cam.zoom, y: anchor.y + 120 / cam.zoom }));
    }
  }, [openThreadId, openFound, store]);

  if (!visible && !open && !draft) return null;

  const placeCard = (anchor: Point | null) => {
    if (!anchor) return { left: Math.max(16, size.width / 2 - 160), top: 80 };
    const p = worldToScreen(camera, anchor);
    // Карточка справа от пина, не вылезая за края холста
    return {
      left: Math.min(Math.max(8, p.x + 20), Math.max(8, size.width - 336)),
      top: Math.min(Math.max(8, p.y - 12), Math.max(8, size.height - 420)),
    };
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[15] overflow-hidden"
      data-testid="comments-layer"
    >
      {visible
        ? threads
            .filter((t) => showResolved || !t.resolvedAt || t.id === openThreadId)
            .map((t) => {
              const anchor = anchorOf(t, store);
              if (!anchor) return null;
              const p = worldToScreen(camera, anchor);
              if (p.x < -40 || p.y < -40 || p.x > size.width + 40 || p.y > size.height + 40)
                return null;
              const count = t.replies.length + 1;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={cn(
                    'pointer-events-auto absolute flex -translate-y-full items-center gap-1 rounded-full rounded-bl-none border-2 border-background px-1.5 py-0.5 text-xs font-semibold text-white shadow-md transition-transform hover:scale-110',
                    t.resolvedAt && 'opacity-60',
                    t.id === openThreadId && 'ring-2 ring-primary',
                  )}
                  style={{ left: p.x, top: p.y, backgroundColor: colorForUser(t.authorId) }}
                  aria-label={`Обсуждение: ${t.authorName}, ${count} сообщ.`}
                  data-testid="comment-pin"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => openThread(t.id === openThreadId ? null : t.id)}
                >
                  {initials(t.authorName)}
                  {count > 1 ? (
                    <span className="rounded-full bg-black/20 px-1">{count}</span>
                  ) : null}
                </button>
              );
            })
        : null}

      {open ? (
        <div className="pointer-events-auto absolute" style={placeCard(anchorOf(open, store))}>
          <ThreadCard
            boardId={boardId}
            thread={open}
            canComment={canComment}
            onClose={() => openThread(null)}
          />
        </div>
      ) : null}

      {draft && canComment ? (
        <>
          <span
            className="absolute -translate-y-full rounded-full rounded-bl-none bg-primary p-1 text-primary-foreground shadow-md"
            style={(() => {
              const p = worldToScreen(camera, draft);
              return { left: p.x, top: p.y };
            })()}
            aria-hidden
          >
            <MessageCircle className="size-3.5" />
          </span>
          <div
            className="pointer-events-auto absolute w-80 rounded-xl border bg-background p-3 shadow-xl"
            style={placeCard(draft)}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid="comment-draft"
          >
            <CommentComposer
              boardId={boardId}
              placeholder="Новый комментарий…"
              autoFocus
              submitLabel="Комментировать"
              onCancel={() => startDraft(null)}
              onSubmit={async (body) => {
                try {
                  const { threadId } = await postComment(boardId, { body, ...draft });
                  openThread(threadId);
                } catch (e: unknown) {
                  toast.error(errorMessage(e, 'Не удалось добавить комментарий'));
                  throw e;
                }
              }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
