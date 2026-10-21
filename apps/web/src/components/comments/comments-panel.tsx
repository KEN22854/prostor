'use client';

import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Eye, EyeOff, MessageSquare, X } from 'lucide-react';
import { commentPlainText, colorForUser, initials } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { cn, plural } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { useCommentsStore } from '@/stores/comments-store';
import { useT } from '@/lib/i18n/client';

/** Список обсуждений доски: открытые / решённые, переход к пину */
export function CommentsPanel() {
  const t = useT();
  const open = useCanvasStore((s) => s.panel === 'comments');
  const setPanel = useCanvasStore((s) => s.setPanel);
  const {
    threads,
    loaded,
    showResolved,
    visible,
    openThreadId,
    setShowResolved,
    setVisible,
    openThread,
  } = useCommentsStore();
  if (!open) return null;

  const list = threads
    .filter((thread) => (showResolved ? thread.resolvedAt : !thread.resolvedAt))
    .reverse();
  const openCount = threads.filter((thread) => !thread.resolvedAt).length;

  return (
    <aside
      className="absolute bottom-0 right-0 top-0 z-20 flex w-80 max-w-full flex-col border-l bg-background shadow-xl"
      aria-label={t('Обсуждения')}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-medium">
          <MessageSquare className="size-4" /> {t('Обсуждения')}
        </h2>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={
              visible ? t('Скрыть комментарии на холсте') : t('Показать комментарии на холсте')
            }
            title={`${visible ? t('Скрыть') : t('Показать')} на холсте (Shift+C)`}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <Eye /> : <EyeOff />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('Закрыть обсуждения')}
            onClick={() => setPanel(null)}
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="flex gap-1 border-b p-2" role="tablist">
        {[
          { resolved: false, label: `Открытые (${openCount})` },
          { resolved: true, label: `Решённые (${threads.length - openCount})` },
        ].map((tab) => (
          <button
            key={String(tab.resolved)}
            type="button"
            role="tab"
            aria-selected={showResolved === tab.resolved}
            className={cn(
              'flex-1 rounded-md px-2 py-1 text-sm',
              showResolved === tab.resolved ? 'bg-accent font-medium' : 'hover:bg-muted',
            )}
            onClick={() => setShowResolved(tab.resolved)}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="comments-list">
        {!loaded ? null : list.length === 0 ? (
          <li className="p-4 text-center text-sm text-muted-foreground">
            {showResolved
              ? 'Решённых обсуждений нет'
              : t(
                  'Обсуждений пока нет. Инструмент «Комментарий» (C) — кликните по объекту или месту на доске.',
                )}
          </li>
        ) : (
          list.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={cn(
                  'w-full rounded-md p-2 text-left hover:bg-muted',
                  openThreadId === thread.id && 'bg-accent',
                )}
                onClick={() => {
                  setVisible(true);
                  openThread(thread.id);
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: colorForUser(thread.authorId) }}
                    aria-hidden
                  >
                    {initials(thread.authorName)}
                  </span>
                  <span className="truncate text-sm font-medium">{thread.authorName}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(thread.createdAt), {
                      addSuffix: true,
                      locale: ru,
                    })}
                  </span>
                </span>
                <span className="mt-1 line-clamp-2 block pl-8 text-sm text-muted-foreground">
                  {commentPlainText(thread.body)}
                </span>
                {thread.replies.length > 0 ? (
                  <span className="block pl-8 text-xs text-primary">
                    {thread.replies.length}{' '}
                    {plural(thread.replies.length, ['ответ', 'ответа', 'ответов'])}
                  </span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
