import { formatDistanceToNow } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import Link from 'next/link';
import type { BoardListItem } from '@prostor/shared';
import { BoardCardMenu } from '@/components/dashboard/board-card-menu';
import { BoardThumbnail } from '@/components/dashboard/board-thumbnail';
import { FavoriteButton } from '@/components/dashboard/favorite-button';
import { getLocale, getT } from '@/lib/i18n/server';

export async function BoardCard({ board }: { board: BoardListItem }) {
  const t = await getT();
  const updated = formatDistanceToNow(new Date(board.lastActivityAt), {
    addSuffix: true,
    locale: (await getLocale()) === 'en' ? enUS : ru,
  });
  return (
    <article className="lift shadow-soft group relative overflow-hidden rounded-2xl border bg-card focus-within:ring-2 focus-within:ring-ring">
      <Link
        href={`/board/${board.id}`}
        className="block focus:outline-none"
        aria-label={t('Открыть «{title}»', { title: board.title })}
      >
        <div className="overflow-hidden">
          <div className="transition-transform duration-500 ease-smooth group-hover:scale-[1.04]">
            <BoardThumbnail
              id={board.id}
              templateKey={board.templateKey}
              thumbnailUrl={board.thumbnailUrl}
            />
          </div>
        </div>
        <div className="space-y-1 p-3 pr-16">
          <h2 className="truncate font-medium transition-colors group-hover:text-primary">
            {board.title}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {board.isOwner ? t('Вы') : (board.owner.name ?? t('Пользователь'))} ·{' '}
            {t('изменена {time}', { time: updated })}
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
