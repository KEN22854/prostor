'use client';

import { LogOut, UserMinus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ROLE_LABELS,
  colorForUser,
  initials,
  type AssignableRole,
  type SharingStateDto,
} from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

interface MembersListProps {
  state: SharingStateDto;
  onChanged: () => Promise<void> | void;
}

/** Участники доски: роли меняет и удаляет только владелец; любой может выйти сам */
export function MembersList({ state, onChanged }: MembersListProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function changeRole(userId: string, role: AssignableRole) {
    setBusy(userId);
    try {
      await apiRequest(`/api/boards/${state.boardId}/members/${userId}`, {
        method: 'PATCH',
        body: { role },
      });
      toast.success(`Роль изменена: ${ROLE_LABELS[role]}`);
      await onChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось изменить роль'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(userId: string, self: boolean) {
    if (
      self &&
      !window.confirm('Покинуть доску? Вернуться можно будет только по новому приглашению.')
    )
      return;
    setBusy(userId);
    try {
      await apiRequest(`/api/boards/${state.boardId}/members/${userId}`, { method: 'DELETE' });
      if (self) {
        toast.success('Вы покинули доску');
        router.push('/dashboard');
        return;
      }
      toast.success('Участник удалён');
      await onChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось удалить участника'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul
      className="max-h-80 divide-y overflow-y-auto rounded-lg border"
      aria-label="Участники доски"
    >
      {state.members.map((m) => (
        <li key={m.userId} className="flex items-center gap-3 p-2.5" data-testid="member-row">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: colorForUser(m.userId) }}
            aria-hidden
          >
            {initials(m.name ?? m.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {m.name ?? m.email}
              {m.isYou ? <span className="ml-1 text-muted-foreground">(вы)</span> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">{m.email}</p>
          </div>
          {state.canManage && !m.isOwner ? (
            <div className="w-36 shrink-0">
              <NativeSelect
                aria-label={`Роль ${m.name ?? m.email}`}
                value={m.role}
                disabled={busy === m.userId}
                onChange={(e) => void changeRole(m.userId, e.target.value as AssignableRole)}
              >
                {state.grantableRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>
          )}
          {!m.isOwner && (state.canManage || m.isYou) ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={m.isYou ? 'Покинуть доску' : `Удалить ${m.name ?? m.email}`}
              disabled={busy === m.userId}
              onClick={() => void remove(m.userId, m.isYou)}
            >
              {m.isYou ? <LogOut /> : <UserMinus />}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
