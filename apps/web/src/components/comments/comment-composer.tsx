'use client';

import { Loader2, SendHorizonal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { COMMENT_MAX_LENGTH, colorForUser, initials, type SharingStateDto } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

interface Member {
  userId: string;
  name: string;
}

/** Участники доски для подсказок @упоминаний — один запрос на доску */
const membersCache = new Map<string, Promise<Member[]>>();
function loadMembers(boardId: string): Promise<Member[]> {
  let pending = membersCache.get(boardId);
  if (!pending) {
    pending = apiRequest<SharingStateDto>(`/api/boards/${boardId}/sharing`)
      .then((s) => s.members.filter((m) => !m.isYou).map((m) => ({ userId: m.userId, name: m.name ?? m.email })))
      .catch(() => []);
    membersCache.set(boardId, pending);
  }
  return pending;
}

interface CommentComposerProps {
  boardId: string;
  placeholder: string;
  initial?: string;
  autoFocus?: boolean;
  submitLabel?: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
}

/**
 * Поле комментария с упоминаниями: «@» открывает список участников доски,
 * выбранный участник вставляется токеном @[Имя](id) — в тексте он показывается
 * как «@Имя», а сервер по нему отправит уведомление.
 */
export function CommentComposer({ boardId, placeholder, initial = '', autoFocus, submitLabel = 'Отправить', onSubmit, onCancel }: CommentComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initial);
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void loadMembers(boardId).then(setMembers);
  }, [boardId]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const suggestions = useMemo(
    () => (query === null ? [] : members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)),
    [members, query],
  );

  /** «@запрос» перед курсором */
  const updateQuery = (text: string, caret: number) => {
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret));
    setQuery(m ? (m[2] ?? '') : null);
    setHighlight(0);
  };

  const insertMention = (member: Member) => {
    const ta = ref.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const before = value.slice(0, caret).replace(/@([^\s@]{0,30})$/, '');
    const token = `@[${member.name.replace(/[\]\n]/g, '')}](${member.userId}) `;
    const next = before + token + value.slice(caret);
    setValue(next);
    setQuery(null);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  async function submit() {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSubmit(body);
      setValue('');
    } catch {
      // Ошибку показывает вызывающий (toast); текст остаётся в поле — можно повторить
    } finally {
      setSending(false);
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const m = suggestions[highlight];
        if (m) insertMention(m);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      onCancel?.();
    }
  };

  return (
    <div className="relative space-y-2">
      <Textarea
        ref={ref}
        value={value}
        rows={2}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-14 resize-none text-sm"
        onChange={(e) => {
          setValue(e.target.value);
          updateQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
      />
      {suggestions.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover p-1 shadow-md" role="listbox" aria-label="Упомянуть участника">
          {suggestions.map((m, i) => (
            <li key={m.userId} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm', i === highlight ? 'bg-accent' : 'hover:bg-muted')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(m)}
              >
                <span className="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: colorForUser(m.userId) }}>
                  {initials(m.name)}
                </span>
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Enter — отправить, @ — упомянуть</span>
        <div className="flex gap-1">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Отмена
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={sending || !value.trim()} onClick={() => void submit()}>
            {sending ? <Loader2 className="animate-spin" /> : <SendHorizonal />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
