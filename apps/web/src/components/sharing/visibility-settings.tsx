'use client';

import { Building2, Check, Copy, Globe, Lock, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { BoardVisibilityValue, SharingStateDto } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copyText } from '@/lib/copy-text';
import { apiRequest } from '@/lib/fetcher';
import { cn, errorMessage } from '@/lib/utils';

const OPTIONS: Array<{
  value: BoardVisibilityValue;
  icon: LucideIcon;
  title: string;
  text: string;
}> = [
  { value: 'PRIVATE', icon: Lock, title: 'Приватная', text: 'Только приглашённые участники' },
  {
    value: 'ORGANIZATION',
    icon: Building2,
    title: 'Организация',
    text: 'Все участники организации могут смотреть',
  },
  {
    value: 'PUBLIC_READ',
    icon: Globe,
    title: 'Публичная',
    text: 'Любой со ссылкой может смотреть без входа',
  },
];

interface VisibilitySettingsProps {
  state: SharingStateDto;
  onChanged: () => Promise<void> | void;
}

/** Видимость доски — меняет только владелец */
export function VisibilitySettings({ state, onChanged }: VisibilitySettingsProps) {
  const [saving, setSaving] = useState<BoardVisibilityValue | null>(null);
  const [copied, setCopied] = useState(false);
  const publicUrl =
    typeof window === 'undefined' ? '' : `${window.location.origin}/board/${state.boardId}`;

  async function choose(value: BoardVisibilityValue) {
    if (value === state.visibility || !state.canManage) return;
    setSaving(value);
    try {
      await apiRequest(`/api/boards/${state.boardId}/visibility`, {
        method: 'PATCH',
        body: { visibility: value },
      });
      toast.success(
        value === 'PUBLIC_READ' ? 'Доска доступна по ссылке для чтения' : 'Доступ обновлён',
      );
      await onChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось изменить доступ'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Видимость доски" className="space-y-2">
        {OPTIONS.map(({ value, icon: Icon, title, text }) => {
          const disabled =
            !state.canManage ||
            (value === 'ORGANIZATION' && !state.inOrganization) ||
            (value === 'PUBLIC_READ' && !state.publicAllowed);
          const active = state.visibility === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled || saving !== null}
              onClick={() => void choose(value)}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                active ? 'border-primary bg-accent/50' : 'hover:bg-muted',
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">
                  {value === 'ORGANIZATION' && !state.inOrganization
                    ? 'Доска не принадлежит организации'
                    : value === 'PUBLIC_READ' && !state.publicAllowed
                      ? 'Запрещено настройками организации'
                      : text}
                </span>
              </span>
              {active ? <Check className="size-4 text-primary" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      {!state.canManage ? (
        <p className="text-xs text-muted-foreground">
          Изменить доступ может только владелец доски.
        </p>
      ) : null}
      {state.visibility === 'PUBLIC_READ' ? (
        <div className="flex gap-2">
          <Input
            readOnly
            value={publicUrl}
            aria-label="Публичная ссылка"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Скопировать публичную ссылку"
            onClick={async () => setCopied(await copyText(publicUrl))}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
