'use client';

import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, Copy, Link2, Loader2, Mail, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  INVITE_TTLS,
  INVITE_TTL_LABELS,
  ROLE_LABELS,
  type AssignableRole,
  type CreatedInviteLinkDto,
  type InviteTtl,
  type SharingStateDto,
} from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { copyText } from '@/lib/copy-text';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

const MAX_USES = [
  { value: '', label: 'Без ограничений' },
  { value: '1', label: '1 раз' },
  { value: '5', label: '5 раз' },
  { value: '25', label: '25 раз' },
  { value: '100', label: '100 раз' },
];

interface InviteLinksProps {
  state: SharingStateDto;
  onChanged: () => Promise<void> | void;
}

/**
 * Ссылки-приглашения: роль, срок жизни, лимит переходов.
 * Ссылку видно только сразу после создания — в БД хранится хеш токена,
 * восстановить её нельзя (это и есть защита при утечке дампа БД).
 */
export function InviteLinks({ state, onChanged }: InviteLinksProps) {
  const [role, setRole] = useState<AssignableRole>(
    state.grantableRoles.includes('EDITOR') ? 'EDITOR' : (state.grantableRoles[0] ?? 'VIEWER'),
  );
  const [ttl, setTtl] = useState<InviteTtl>('7d');
  const [maxUses, setMaxUses] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedInviteLinkDto | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const link = await apiRequest<CreatedInviteLinkDto>(`/api/boards/${state.boardId}/invites`, {
        method: 'POST',
        body: { role, ttl, maxUses: maxUses ? Number(maxUses) : null },
      });
      setCreated(link);
      setCopied(false);
      if (await copyText(link.url)) {
        setCopied(true);
        toast.success('Ссылка создана и скопирована');
      }
      await onChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось создать ссылку'));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    try {
      await apiRequest(`/api/boards/${state.boardId}/invites/${id}`, { method: 'DELETE' });
      if (created?.id === id) setCreated(null);
      toast.success('Приглашение отозвано');
      await onChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось отозвать приглашение'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="link-role">Роль</Label>
          <NativeSelect
            id="link-role"
            value={role}
            onChange={(e) => setRole(e.target.value as AssignableRole)}
          >
            {state.grantableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="link-ttl">Срок действия</Label>
          <NativeSelect
            id="link-ttl"
            value={ttl}
            onChange={(e) => setTtl(e.target.value as InviteTtl)}
          >
            {INVITE_TTLS.map((t) => (
              <option key={t} value={t}>
                {INVITE_TTL_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="link-uses">Переходов</Label>
          <NativeSelect id="link-uses" value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
            {MAX_USES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Button onClick={() => void create()} disabled={creating}>
        {creating ? <Loader2 className="animate-spin" /> : <Link2 />}
        Создать ссылку
      </Button>

      {created ? (
        <div className="space-y-1.5 rounded-lg border border-primary/40 bg-accent/40 p-3">
          <Label htmlFor="created-link">
            Новая ссылка — скопируйте сейчас, позже её не будет видно
          </Label>
          <div className="flex gap-2">
            <Input
              id="created-link"
              readOnly
              value={created.url}
              onFocus={(e) => e.currentTarget.select()}
              data-testid="created-invite-url"
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Скопировать ссылку"
              onClick={async () => setCopied(await copyText(created.url))}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Активные приглашения</p>
        {state.invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет активных приглашений</p>
        ) : (
          <ul
            className="max-h-56 divide-y overflow-y-auto rounded-lg border"
            data-testid="invite-list"
          >
            {state.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 p-2.5 text-sm">
                {i.email ? (
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {i.email ?? 'Ссылка-приглашение'} · {ROLE_LABELS[i.role]}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {i.maxUses
                      ? `использовано ${i.uses} из ${i.maxUses}`
                      : `использовано ${i.uses}`}
                    {' · '}
                    {i.expiresAt
                      ? `истекает ${formatDistanceToNow(new Date(i.expiresAt), { addSuffix: true, locale: ru })}`
                      : 'бессрочно'}
                    {i.createdByName ? ` · создал(а) ${i.createdByName}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Отозвать приглашение"
                  onClick={() => void revoke(i.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
