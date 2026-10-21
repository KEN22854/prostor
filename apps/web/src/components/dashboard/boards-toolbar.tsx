'use client';

import { ArrowUpDown, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { ListBoardsQuery } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

const FILTERS: Array<{ value: ListBoardsQuery['filter']; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'mine', label: 'Мои' },
  { value: 'shared', label: 'Доступные мне' },
  { value: 'favorites', label: 'Избранное' },
];

const SORTS: Array<{ value: ListBoardsQuery['sort']; label: string }> = [
  { value: 'recent', label: 'По активности' },
  { value: 'name', label: 'По названию' },
  { value: 'created', label: 'По дате создания' },
];

/**
 * Фильтры живут в URL (?q=&sort=&filter=): Server Component страницы
 * перечитывает список, ссылку можно отправить коллеге, «назад» работает.
 */
export function BoardsToolbar({ query }: { query: ListBoardsQuery }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(query.q ?? '');

  function update(patch: Partial<Record<'q' | 'sort' | 'filter', string>>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  // Поиск с debounce: не дёргаем сервер на каждую букву
  useEffect(() => {
    if (q === (query.q ?? '')) return;
    const timer = setTimeout(() => update({ q }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update пересоздаётся каждый рендер
  }, [q]);

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', pending && 'opacity-70')}>
      <div
        role="tablist"
        aria-label={t('Фильтр досок')}
        className="flex gap-1 rounded-lg bg-muted p-1"
      >
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={query.filter === f.value}
            onClick={() => update({ filter: f.value === 'all' ? '' : f.value })}
            className={cn(
              'rounded-md px-3 py-1 text-sm transition-colors',
              query.filter === f.value
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(f.label)}
          </button>
        ))}
      </div>

      <div className="flex flex-1 gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Поиск по названию и содержимому')}
            className="pl-9"
            aria-label={t('Поиск досок')}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <ArrowUpDown />
              <span className="hidden sm:inline">
                {t(SORTS.find((s) => s.value === query.sort)?.label ?? '')}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={query.sort}
              onValueChange={(v) => update({ sort: v === 'recent' ? '' : v })}
            >
              {SORTS.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>
                  {t(s.label)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
