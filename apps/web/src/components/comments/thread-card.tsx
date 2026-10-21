'use client';

import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, MoreHorizontal, RotateCcw, SmilePlus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  REACTION_EMOJIS,
  colorForUser,
  initials,
  type CommentDto,
  type CommentThreadDto,
} from '@prostor/shared';
import { CommentBody } from '@/components/comments/comment-body';
import { CommentComposer } from '@/components/comments/comment-composer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  editComment,
  postComment,
  removeComment,
  setResolved,
  toggleReaction,
} from '@/lib/comments-api';
import { cn, errorMessage } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

interface CommentItemProps {
  boardId: string;
  comment: CommentDto;
  canReact: boolean;
  isRoot: boolean;
}

function CommentItem({ boardId, comment, canReact, isRoot }: CommentItemProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const react = (emoji: string) =>
    toggleReaction(boardId, comment.id, emoji).catch((e: unknown) =>
      toast.error(errorMessage(e, t('Не удалось поставить реакцию'))),
    );

  return (
    <div className="group space-y-1" data-testid="comment">
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: colorForUser(comment.authorId) }}
          aria-hidden
        >
          {initials(comment.authorName)}
        </span>
        <span className="truncate text-sm font-medium">{comment.authorName}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ru })}
          {comment.editedAt ? t(' · изменено') : ''}
        </span>
        {comment.canEdit || comment.canDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-6 opacity-0 focus:opacity-100 group-hover:opacity-100"
                aria-label={t('Действия с комментарием')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {comment.canEdit ? (
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  {t('Изменить')}
                </DropdownMenuItem>
              ) : null}
              {comment.canDelete ? (
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => {
                    const msg = isRoot
                      ? 'Удалить обсуждение вместе с ответами?'
                      : 'Удалить комментарий?';
                    if (window.confirm(msg)) {
                      void removeComment(boardId, comment.id).catch((e: unknown) =>
                        toast.error(errorMessage(e, t('Не удалось удалить'))),
                      );
                    }
                  }}
                >
                  {t('Удалить')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {editing ? (
        <CommentComposer
          boardId={boardId}
          placeholder={t('Изменить комментарий')}
          initial={comment.body}
          autoFocus
          submitLabel="Сохранить"
          onSubmit={async (body) => {
            await editComment(boardId, comment.id, body);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="pl-8">
          <CommentBody body={comment.body} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 pl-8">
        {comment.reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            disabled={!canReact}
            onClick={() => void react(r.emoji)}
            className={cn(
              'rounded-full border px-1.5 text-xs',
              r.mine ? 'border-primary bg-primary/10' : 'hover:bg-muted',
            )}
            aria-label={`${r.emoji} ${r.count}`}
          >
            {r.emoji} {r.count}
          </button>
        ))}
        {canReact ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-full p-0.5 text-muted-foreground opacity-0 hover:bg-muted focus:opacity-100 group-hover:opacity-100"
                aria-label={t('Добавить реакцию')}
              >
                <SmilePlus className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="flex w-auto gap-1 p-1" side="top">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded p-1 text-base hover:bg-muted"
                  onClick={() => void react(e)}
                >
                  {e}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

interface ThreadCardProps {
  boardId: string;
  thread: CommentThreadDto;
  canComment: boolean;
  onClose: () => void;
}

/** Обсуждение: корневой комментарий, ответы, реакции, «решено», ответ */
export function ThreadCard({ boardId, thread, canComment, onClose }: ThreadCardProps) {
  const t = useT();
  const resolved = thread.resolvedAt !== null;
  return (
    <div
      className="w-80 rounded-xl border bg-background shadow-xl"
      data-testid="thread-card"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {resolved ? t('Обсуждение решено') : t('Обсуждение')}
        </span>
        <div className="flex items-center gap-0.5">
          {thread.canResolve ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() =>
                void setResolved(boardId, thread.id, !resolved)
                  .then(() => !resolved && onClose())
                  .catch((e: unknown) =>
                    toast.error(errorMessage(e, t('Не удалось изменить статус'))),
                  )
              }
            >
              {resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
              {resolved ? t('Открыть снова') : t('Решено')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t('Закрыть обсуждение')}
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="max-h-80 space-y-3 overflow-y-auto p-3">
        <CommentItem boardId={boardId} comment={thread} canReact={canComment} isRoot />
        {thread.replies.map((r) => (
          <CommentItem
            key={r.id}
            boardId={boardId}
            comment={r}
            canReact={canComment}
            isRoot={false}
          />
        ))}
      </div>
      {canComment ? (
        <div className="border-t p-3">
          <CommentComposer
            boardId={boardId}
            placeholder={t('Ответить…')}
            autoFocus
            onSubmit={async (body) => {
              try {
                await postComment(boardId, { body, parentId: thread.id });
              } catch (e: unknown) {
                toast.error(errorMessage(e, t('Не удалось отправить')));
                throw e;
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
