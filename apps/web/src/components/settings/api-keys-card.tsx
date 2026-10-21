'use client';

import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ApiKeyDto, ApiScope, CreatedApiKeyDto } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

const dateFmt = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });

/**
 * Персональные API-ключи: создание (ключ показывается один раз), список,
 * отзыв. Ключ действует от вашего имени с вашими правами на доски.
 */
export function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeyDto[] | null>(null);
  const [name, setName] = useState('');
  const [write, setWrite] = useState(false);
  const [created, setCreated] = useState<CreatedApiKeyDto | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest<{ keys: ApiKeyDto[] }>('/api/account/api-keys')
      .then((r) => setKeys(r.keys))
      .catch((e: unknown) => toast.error(errorMessage(e, 'Не удалось загрузить ключи')));
  }, []);

  async function create() {
    setBusy(true);
    try {
      const scopes: ApiScope[] = write ? ['read', 'write'] : ['read'];
      const key = await apiRequest<CreatedApiKeyDto>('/api/account/api-keys', {
        method: 'POST',
        body: { name: name.trim(), scopes },
      });
      setCreated(key);
      setKeys((list) => [key, ...(list ?? [])]);
      setName('');
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось создать ключ'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Отозвать ключ? Программы, которые им пользуются, перестанут работать'))
      return;
    try {
      await apiRequest(`/api/account/api-keys/${id}`, { method: 'DELETE' });
      setKeys((list) => list?.filter((k) => k.id !== id) ?? null);
      if (created?.id === id) setCreated(null);
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось отозвать ключ'));
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
            Ключ «{created.name}» создан. Скопируйте его сейчас — больше он не покажется
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={created.key}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Скопировать ключ"
              onClick={() => {
                void navigator.clipboard
                  .writeText(created.key)
                  .then(() => toast.success('Ключ скопирован'));
              }}
            >
              <Copy />
            </Button>
          </div>
          <p className="text-muted-foreground">
            Пример:{' '}
            <code className="rounded bg-muted px-1">
              curl -H &quot;Authorization: Bearer {created.prefix}…&quot;{' '}
              {typeof window === 'undefined' ? '' : window.location.origin}/api/v1/boards
            </code>
          </p>
        </div>
      ) : null}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void create();
        }}
      >
        <Input
          value={name}
          maxLength={80}
          placeholder="Название, например «Jira-интеграция»"
          aria-label="Название ключа"
          className="min-w-52 flex-1"
          onChange={(e) => setName(e.target.value)}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={write}
            onChange={(e) => setWrite(e.target.checked)}
          />
          Разрешить изменения
        </label>
        <Button type="submit" disabled={busy || !name.trim()}>
          <KeyRound /> Создать ключ
        </Button>
      </form>

      {keys === null ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : keys.length === 0 ? (
        <p className="text-muted-foreground">Ключей пока нет</p>
      ) : (
        <ul className="divide-y rounded-md border" aria-label="API-ключи">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{k.name}</p>
                <p className="text-xs text-muted-foreground">
                  <code>{k.prefix}…</code> ·{' '}
                  {k.scopes.includes('write') ? 'чтение и изменения' : 'только чтение'} · создан{' '}
                  {dateFmt.format(new Date(k.createdAt))}
                  {k.lastUsedAt
                    ? ` · использован ${dateFmt.format(new Date(k.lastUsedAt))}`
                    : ' · не использовался'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Отозвать ключ ${k.name}`}
                onClick={() => void revoke(k.id)}
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
