'use client';

import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { ElementStore } from '@/lib/canvas/element-store';
import { worldToScreen } from '@/lib/canvas/viewport';
import { cn, errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { retractVote, useVotingStore } from '@/stores/voting-store';
import { useT } from '@/lib/i18n/client';

const noop = () => () => undefined;
const zero = () => 0;
const MEDALS = [
  'bg-amber-400 text-amber-950',
  'bg-slate-300 text-slate-900',
  'bg-orange-300 text-orange-950',
];

/**
 * Голоса на объектах: во время голосования — только свои (клик снимает голос),
 * после — итоги у всех, тройка лидеров выделена.
 */
export function VotesLayer({ store }: { store: ElementStore | null }) {
  const t = useT();
  const camera = useCanvasStore((s) => s.camera);
  const voting = useVotingStore((s) => s.voting);
  const boardId = useVotingStore((s) => s.boardId);
  useSyncExternalStore(store?.subscribe ?? noop, store?.getVersion ?? zero, zero);
  if (!voting || !store) return null;

  const entries =
    voting.status === 'ended'
      ? (voting.results ?? []).map((r, i) => ({ elementId: r.elementId, count: r.count, rank: i }))
      : Object.entries(voting.myVotes).map(([elementId, count]) => ({
          elementId,
          count,
          rank: -1,
        }));

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[14] overflow-hidden"
      data-testid="votes-layer"
    >
      {entries.map(({ elementId, count, rank }) => {
        const el = store.get(elementId);
        if (!el) return null;
        const p = worldToScreen(camera, { x: el.x + el.width, y: el.y + el.height });
        const mine = voting.status === 'active';
        return (
          <button
            key={elementId}
            type="button"
            disabled={!mine}
            className={cn(
              'absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border-2 border-background px-2 py-0.5 text-xs font-bold shadow-md',
              mine
                ? 'pointer-events-auto bg-primary text-primary-foreground hover:bg-destructive'
                : (MEDALS[rank] ?? 'bg-background text-foreground'),
            )}
            style={{ left: p.x, top: p.y }}
            title={mine ? t('Забрать голос') : undefined}
            aria-label={mine ? `Мои голоса: ${count}. Забрать один` : `Голосов: ${count}`}
            data-testid={mine ? 'my-vote' : 'vote-result'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (!boardId) return;
              void retractVote(boardId, voting.id, elementId).catch((e: unknown) =>
                toast.error(errorMessage(e, t('Не удалось забрать голос'))),
              );
            }}
          >
            {mine ? '✓' : null}
            {count}
          </button>
        );
      })}
    </div>
  );
}
