'use client';

import { ListOrdered, MousePointer2, Vote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ElementStore } from '@/lib/canvas/element-store';
import { boundsOf } from '@/lib/canvas/read-element';
import { fitBounds } from '@/lib/canvas/viewport';
import { cn, errorMessage, plural } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { closeVoting, endVoting, useVotingStore } from '@/stores/voting-store';

function elementLabel(store: ElementStore, id: string): string {
  const el = store.get(id);
  if (!el) return 'Удалённый объект';
  const text = 'text' in el && typeof el.text === 'string' ? el.text.trim() : '';
  if (text) return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  return el.type === 'image' ? 'Изображение' : 'Объект без текста';
}

/** Полоса голосования над холстом: сколько голосов осталось, завершение, итоги */
export function VotingBar({ store }: { store: ElementStore | null }) {
  const voting = useVotingStore((s) => s.voting);
  const boardId = useVotingStore((s) => s.boardId);
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  if (!voting || !boardId || !store) return null;

  const fail = (fallback: string) => (e: unknown) => toast.error(errorMessage(e, fallback));
  const active = voting.status === 'active';

  return (
    <div
      className="absolute left-1/2 top-16 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border bg-background/95 px-3 py-1.5 text-sm shadow-md backdrop-blur"
      data-testid="voting-bar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Vote className="size-4 text-primary" aria-hidden />
      <span className="font-medium">{active ? voting.title : `Итоги: ${voting.title}`}</span>
      <span className="text-muted-foreground">
        {active && voting.canVote
          ? `осталось ${voting.myRemaining} из ${voting.votesPerUser}`
          : `${voting.totalVotes} ${plural(voting.totalVotes, ['голос', 'голоса', 'голосов'])}`}
        {` · ${voting.voters} ${plural(voting.voters, ['участник', 'участника', 'участников'])}`}
      </span>
      {active && voting.canVote ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => setTool(tool === 'vote' ? 'select' : 'vote')}
          title={tool === 'vote' ? 'Перейти к выделению' : 'Голосовать: клик по объекту'}
        >
          {tool === 'vote' ? <MousePointer2 /> : <Vote />}
          {tool === 'vote' ? 'Выделять' : 'Голосовать'}
        </Button>
      ) : null}
      {!active && voting.results && voting.results.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2">
              <ListOrdered /> Рейтинг
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-1">
            <ol className="max-h-80 overflow-y-auto" aria-label="Итоги голосования">
              {voting.results.slice(0, 20).map((r, i) => (
                <li key={r.elementId}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                      i < 3 && 'font-medium',
                    )}
                    onClick={() => {
                      const el = store.get(r.elementId);
                      if (!el) return;
                      const { size, setCamera, select } = useCanvasStore.getState();
                      setCamera(fitBounds(boundsOf(el), size, 160, 1.5));
                      select([el.id]);
                    }}
                  >
                    <span className="w-5 shrink-0 text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {elementLabel(store, r.elementId)}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 text-xs">{r.count}</span>
                  </button>
                </li>
              ))}
            </ol>
          </PopoverContent>
        </Popover>
      ) : null}
      {voting.canManage ? (
        active ? (
          <Button
            size="sm"
            className="h-7"
            onClick={() => void endVoting(boardId, voting.id).catch(fail('Не удалось завершить'))}
          >
            Завершить
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() =>
              void closeVoting(boardId, voting.id).catch(fail('Не удалось скрыть итоги'))
            }
          >
            Скрыть итоги
          </Button>
        )
      ) : null}
    </div>
  );
}
