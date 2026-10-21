'use client';

import { Loader2, Send, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import {
  ROLE_LABELS,
  emailSchema,
  type AssignableRole,
  type EmailInviteResultDto,
  type SharingStateDto,
} from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

interface EmailInviteFormProps {
  state: SharingStateDto;
  onChanged: () => Promise<void> | void;
}

/** Адреса через запятую, пробел или Enter — превращаются в «чипы» */
export function EmailInviteForm({ state, onChanged }: EmailInviteFormProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [role, setRole] = useState<AssignableRole>(state.grantableRoles[0] ?? 'VIEWER');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const commit = (raw: string): string[] => {
    const parts = raw.split(/[\s,;]+/).filter(Boolean);
    const valid: string[] = [];
    for (const p of parts) {
      const parsed = emailSchema.safeParse(p);
      if (parsed.success) valid.push(parsed.data);
      else toast.error(`Некорректный email: ${p}`);
    }
    const next = Array.from(new Set([...emails, ...valid])).slice(0, 20);
    setEmails(next);
    setDraft('');
    return next;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ' ', ';'].includes(e.key) && draft.trim()) {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && emails.length > 0) {
      setEmails(emails.slice(0, -1));
    }
  };

  async function send() {
    const list = draft.trim() ? commit(draft) : emails;
    if (list.length === 0) {
      toast.error('Добавьте хотя бы один email');
      return;
    }
    setSending(true);
    try {
      const { results } = await apiRequest<{ results: EmailInviteResultDto[] }>(
        `/api/boards/${state.boardId}/invites/email`,
        { method: 'POST', body: { emails: list, role, message: message || undefined } },
      );
      const sent = results.filter((r) => r.status === 'sent').length;
      const already = results.filter((r) => r.status === 'already_member').map((r) => r.email);
      const failed = results.filter((r) => r.status === 'failed').map((r) => r.email);
      if (sent > 0) toast.success(sent === 1 ? 'Приглашение отправлено' : `Отправлено приглашений: ${sent}`);
      if (already.length > 0) toast.info(`Уже есть доступ: ${already.join(', ')}`);
      if (failed.length > 0) toast.error(`Не удалось отправить: ${failed.join(', ')}`);
      setEmails(failed);
      setMessage('');
      await onChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось отправить приглашения'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="invite-emails">Email</Label>
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1 focus-within:ring-2 focus-within:ring-ring">
          {emails.map((email) => (
            <span key={email} className="flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              {email}
              <button type="button" aria-label={`Убрать ${email}`} onClick={() => setEmails(emails.filter((e) => e !== email))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          <Input
            id="invite-emails"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => draft.trim() && commit(draft)}
            placeholder={emails.length ? '' : 'colleague@company.ru, …'}
            className="h-7 min-w-40 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Роль</Label>
          <NativeSelect id="invite-role" value={role} onChange={(e) => setRole(e.target.value as AssignableRole)}>
            {state.grantableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-message">Сообщение (необязательно)</Label>
          <Input id="invite-message" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} placeholder="Посмотри, пожалуйста, до пятницы" />
        </div>
      </div>
      <Button onClick={() => void send()} disabled={sending || (emails.length === 0 && !draft.trim())}>
        {sending ? <Loader2 className="animate-spin" /> : <Send />}
        Пригласить
      </Button>
    </div>
  );
}
