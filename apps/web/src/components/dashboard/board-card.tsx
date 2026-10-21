import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import Link from 'next/link';
import type { BoardListItem } from '@prostor/shared';
import { BoardCardMenu } from '@/components/dashboard/board-card-menu';
import { BoardThumbnail } from '@/components/dashboard/board-thumbnail';
import { FavoriteButton } from '@/components/dashboard/favorite-button';

export function BoardCard({ board }: { board: BoardListItem }) {
  const updated = formatDistanceToNow(new Date(board.lastActivityAt), {
    addSuffix: true,
    locale: ru,
  });
  return (
    <article className="group relative overflow-hidden rounded-xl border bg-card transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <Link
        href={`/board/${board.id}`}
        className="block focus:outline-none"
        aria-label={`Открыть «${board.title}»`}
      >
        <BoardThumbnail
          id={board.id}
          templateKey={board.templateKey}
          thumbnailUrl={board.thumbnailUrl}
        />
        <div className="space-y-1 p-3 pr-16">
          <h2 className="truncate font-medium">{board.title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {board.isOwner ? 'Вы' : (board.owner.name ?? 'Пользователь')} · изменена {updated}
          </p>
        </div>
      </Link>
      <div className="absolute bottom-2 right-2 flex items-center">
        <FavoriteButton boardId={board.id} isFavorite={board.isFavorite} />
        <BoardCardMenu board={board} />
      </div>
    </article>
  );
}
