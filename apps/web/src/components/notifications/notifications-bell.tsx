'use client';

import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Bell, CheckCheck } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { NotificationDto } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiRequest } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { useCommentsStore } from '@/stores/comments-store';

const POLL_MS = 60_000;

function describe(n: NotificationDto): string {
  const actor = n.actorName ?? 'Участник';
  const board = n.boardTitle ? `«${n.boardTitle}»` : 'доске';
  switch (n.type) {
    case 'MENTION':
      return `${actor} упомянул(а) вас на доске ${board}`;
    case 'COMMENT_REPLY':
      return `${actor} ответил(а) в обсуждении на доске ${board}`;
    case 'INVITE':
      return `${actor} пригласил(а) вас на доску ${board}`;
    case 'BOARD_SHARED':
      return `Вам открыли доступ к доске ${board}`;
    case 'AI_JOB_DONE':
      return `ИИ-задача на доске ${board} готова`;
  }
}

/** Уведомления: упоминания, ответы, приглашения. Опрос раз в минуту и при возврате на вкладку */
export function NotificationsBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<{ items: NotificationDto[]; unread: number }>('/api/notifications');
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      // Сеть недоступна — попробуем при следующем опросе
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const markRead = async (ids: string[] | null) => {
    await apiRequest('/api/notifications/read', { method: 'POST', body: ids ? { ids } : {} }).catch(() => undefined);
    await load();
  };

  const go = (n: NotificationDto) => {
    setOpen(false);
    void markRead([n.id]);
    if (!n.boardId) return;
    const path = `/board/${n.boardId}`;
    if (n.threadId && pathname === path) {
      // Уже на этой доске — просто открываем обсуждение
      useCommentsStore.getState().setVisible(true);
      useCommentsStore.getState().openThread(n.threadId);
      return;
    }
    router.push(n.threadId ? `${path}?thread=${n.threadId}` : path);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread > 0 ? `Уведомления: ${unread} новых` : 'Уведомления'}>
          <Bell />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white" data-testid="unread-count">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Уведомления</span>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void markRead(null)}>
              <CheckCheck className="size-3.5" /> Прочитать все
            </Button>
          ) : null}
        </div>
        <ul className="max-h-96 overflow-y-auto" aria-label="Список уведомлений">
          {items.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">Уведомлений пока нет</li>
          ) : (
            items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => go(n)}
                  className={cn('flex w-full gap-2 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted', !n.readAt && 'bg-primary/5')}
                >
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm">{describe(n)}</span>
                    {n.excerpt ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">«{n.excerpt}»</span> : null}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ru })}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
