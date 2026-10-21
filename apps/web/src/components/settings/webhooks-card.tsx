'use client';

import { Copy, Send, Trash2, Webhook } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  type CreatedWebhookDto,
  type WebhookDto,
  type WebhookEvent,
} from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/fetcher';
import { cn, errorMessage } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

const dateFmt = new Intl.DateTimeFormat('ru', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Вебхуки: POST на ваш адрес при событиях досок (Slack, Telegram-бот, Jira,
 * Zapier/Make, свой сервис). Тело подписано HMAC-SHA256 секретом —
 * заголовок X-Prostor-Signature: sha256=<hex>.
 */
export function WebhooksCard() {
  const t = useT();
  const [hooks, setHooks] = useState<WebhookDto[] | null>(null);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['comment.created', 'board.updated']);
  const [created, setCreated] = useState<CreatedWebhookDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    apiRequest<{ webhooks: WebhookDto[] }>('/api/account/webhooks')
      .then((r) => setHooks(r.webhooks))
      .catch((e: unknown) => toast.error(errorMessage(e, t('Не удалось загрузить вебхуки'))));
  useEffect(() => void load(), []);

  async function create() {
    setBusy(true);
    try {
      const hook = await apiRequest<CreatedWebhookDto>('/api/account/webhooks', {
        method: 'POST',
        body: { url: url.trim(), events },
      });
      setCreated(hook);
      setHooks((list) => [hook, ...(list ?? [])]);
      setUrl('');
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось создать вебхук')));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(hook: WebhookDto) {
    try {
      const next = await apiRequest<WebhookDto>(`/api/account/webhooks/${hook.id}`, {
        method: 'PATCH',
        body: { active: !hook.active },
      });
      setHooks((list) => list?.map((h) => (h.id === hook.id ? next : h)) ?? null);
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось изменить вебхук')));
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Удалить вебхук?')) return;
    try {
      await apiRequest(`/api/account/webhooks/${id}`, { method: 'DELETE' });
      setHooks((list) => list?.filter((h) => h.id !== id) ?? null);
      if (created?.id === id) setCreated(null);
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось удалить вебхук')));
    }
  }

  async function ping(id: string) {
    try {
      await apiRequest(`/api/account/webhooks/${id}/ping`, { method: 'POST' });
      toast.success(t('Проверочное событие отправлено — статус обновится через пару секунд'));
      setTimeout(() => void load(), 3_000);
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось отправить проверку')));
    }
  }

  return (
    <div className="space-y-4 text-sm">
      {created ? (
        <div
          className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3"
          role="status"
        >
          <p className="font-medium">
            {t('Секрет подписи — скопируйте сейчас, больше он не покажется')}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={created.secret}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label={t('Скопировать секрет')}
              onClick={() =>
                void navigator.clipboard
                  .writeText(created.secret)
                  .then(() => toast.success(t('Секрет скопирован')))
              }
            >
              <Copy />
            </Button>
          </div>
          <p className="text-muted-foreground">
            Проверка: HMAC-SHA256(секрет, тело запроса) в hex должен совпасть с заголовком
            X-Prostor-Signature после «sha256=»
          </p>
        </div>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() && events.length > 0) void create();
        }}
      >
        <Input
          value={url}
          type="url"
          placeholder="https://example.com/prostor-webhook"
          aria-label={t('Адрес вебхука')}
          onChange={(e) => setUrl(e.target.value)}
        />
        <fieldset className="grid gap-1.5 sm:grid-cols-2">
          <legend className="mb-1 text-muted-foreground">{t('События')}</legend>
          {WEBHOOK_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={events.includes(event)}
                onChange={(e) =>
                  setEvents((list) =>
                    e.target.checked ? [...list, event] : list.filter((x) => x !== event),
                  )
                }
              />
              {WEBHOOK_EVENT_LABELS[event]}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={busy || !url.trim() || events.length === 0}>
          <Webhook /> {t('Добавить вебхук')}
        </Button>
      </form>

      {hooks === null ? (
        <p className="text-muted-foreground">{t('Загрузка…')}</p>
      ) : hooks.length === 0 ? (
        <p className="text-muted-foreground">{t('Вебхуков пока нет')}</p>
      ) : (
        <ul className="divide-y rounded-md border" aria-label={t('Вебхуки')}>
          {hooks.map((h) => (
            <li key={h.id} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate font-medium',
                    !h.active && 'text-muted-foreground line-through',
                  )}
                >
                  {h.url}
                </p>
                <p className="text-xs text-muted-foreground">
                  {h.events.length} {h.events.length === 1 ? t('событие') : t('событий')}
                  {h.boardTitle ? ` · доска «${h.boardTitle}»` : t(' · все доски')}
                  {h.lastDeliveryAt
                    ? ` · ${dateFmt.format(new Date(h.lastDeliveryAt))}: ${h.lastError ?? `HTTP ${h.lastStatus ?? '—'}`}`
                    : t(' · доставок ещё не было')}
                  {!h.active && h.failureCount > 0 ? t(' · выключен после серии ошибок') : ''}
                </p>
              </div>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={h.active}
                  onChange={() => void toggle(h)}
                />
                {t('Вкл.')}
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('Отправить проверку')}
                onClick={() => void ping(h.id)}
              >
                <Send />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('Удалить вебхук')}
                onClick={() => void remove(h.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
