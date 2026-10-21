import { Building2, ChevronRight, LayoutGrid, Settings, User } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listBoardsQuerySchema, type FolderDto, type ListBoardsQuery } from '@prostor/shared';
import { BoardCard } from '@/components/dashboard/board-card';
import { BoardsToolbar } from '@/components/dashboard/boards-toolbar';
import { CreateBoardDialog } from '@/components/dashboard/create-board-dialog';
import { CreateFolderButton } from '@/components/dashboard/create-folder-button';
import { CreateOrgButton } from '@/components/dashboard/create-org-button';
import { FolderTree } from '@/components/dashboard/folder-tree';
import { UserMenu } from '@/components/dashboard/user-menu';
import { getSessionUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import { listBoards } from '@/services/boards';
import { listFolders } from '@/services/folders';
import { listMyOrgs } from '@/services/orgs';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Мои доски') };
}

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Цепочка папок от корня до открытой — для хлебных крошек */
function breadcrumbs(folders: FolderDto[], folderId: string | undefined): FolderDto[] {
  const current = folders.find((f) => f.id === folderId);
  if (!current) return [];
  const ids = current.path.split('/').filter(Boolean);
  return ids
    .map((id) => folders.find((f) => f.id === id))
    .filter((f): f is FolderDto => f !== undefined);
}

/**
 * Server Component: рабочие пространства (личное и организации), дерево папок
 * и доски читаются прямо из сервисов. Интерактивные части — клиентские острова.
 * Состояние — в URL (?org=&folder=&q=&sort=&filter=): ссылку можно отправить коллеге.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const t = await getT();
  const user = await getSessionUser();
  if (!user) redirect('/login?callbackUrl=/dashboard');

  const raw = await searchParams;
  const parsed = listBoardsQuerySchema.safeParse({
    q: typeof raw.q === 'string' ? raw.q : undefined,
    sort: typeof raw.sort === 'string' ? raw.sort : undefined,
    filter: typeof raw.filter === 'string' ? raw.filter : undefined,
    org: typeof raw.org === 'string' ? raw.org : undefined,
    folder: typeof raw.folder === 'string' ? raw.folder : undefined,
  });
  const query: ListBoardsQuery = parsed.success ? parsed.data : { sort: 'recent', filter: 'all' };

  const orgs = await listMyOrgs(user.id);
  // Чужая/несуществующая организация в URL — просто личное пространство
  const org = orgs.find((o) => o.id === query.org) ?? null;
  const effective: ListBoardsQuery = { ...query, org: org?.id };
  const [folders, boards] = await Promise.all([
    listFolders(user, org?.id ?? null),
    listBoards(user, effective),
  ]);
  const trail = breadcrumbs(folders, query.folder);
  const currentFolder = trail[trail.length - 1] ?? null;
  const baseQuery = org ? `org=${org.id}` : '';

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="font-semibold">
            {t('Простор')}
          </Link>
          <UserMenu name={user.name} email={user.email ?? ''} />
        </div>
      </header>

      <div className="flex">
        <aside
          className="hidden min-h-[calc(100dvh-3.5rem)] w-64 shrink-0 border-r bg-background p-3 md:block"
          aria-label={t('Рабочие пространства')}
        >
          <nav className="space-y-0.5">
            <Link
              href="/dashboard"
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                !org && !query.folder && 'bg-accent font-medium',
              )}
            >
              <User className="size-4" /> {t('Все доски')}
            </Link>
          </nav>

          <div className="mt-4 flex items-center justify-between px-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('Организации')}
            </span>
            <CreateOrgButton />
          </div>
          <nav className="space-y-0.5" aria-label={t('Организации')}>
            {orgs.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t('Нет организаций')}</p>
            ) : null}
            {orgs.map((o) => (
              <div
                key={o.id}
                className={cn(
                  'group flex items-center rounded-md hover:bg-muted',
                  org?.id === o.id && !query.folder && 'bg-accent font-medium',
                )}
              >
                <Link
                  href={`/dashboard?org=${o.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm"
                >
                  <Building2 className="size-4 shrink-0" />
                  <span className="truncate">{o.name}</span>
                </Link>
                <Link
                  href={`/org/${o.id}/settings`}
                  className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Настройки организации «${o.name}»`}
                >
                  <Settings className="size-3.5" />
                </Link>
              </div>
            ))}
          </nav>

          <div className="mt-4 flex items-center justify-between px-2">
            <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('Папки')}
              {org ? ` · ${org.name}` : ''}
            </span>
            <CreateFolderButton orgId={org?.id ?? null} parentId={currentFolder?.id ?? null} />
          </div>
          <FolderTree
            folders={folders}
            activeId={currentFolder?.id ?? null}
            baseQuery={baseQuery}
          />
        </aside>

        <main className="min-w-0 flex-1 space-y-6 p-4 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <nav
                className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
                aria-label={t('Путь')}
              >
                <Link
                  href={org ? `/dashboard?org=${org.id}` : '/dashboard'}
                  className="hover:text-foreground"
                >
                  {org ? org.name : t('Мои доски')}
                </Link>
                {trail.map((f) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <ChevronRight className="size-3.5" />
                    <Link
                      href={`/dashboard?${baseQuery}${baseQuery ? '&' : ''}folder=${f.id}`}
                      className="hover:text-foreground"
                    >
                      {f.name}
                    </Link>
                  </span>
                ))}
              </nav>
              <h1 className="truncate text-2xl font-semibold">
                {currentFolder?.name ?? (org ? org.name : t('Доски'))}
              </h1>
            </div>
            <CreateBoardDialog orgId={org?.id ?? null} folderId={currentFolder?.id ?? null} />
          </div>

          <BoardsToolbar query={query} />

          {boards.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {boards.map((board) => (
                <li key={board.id}>
                  <BoardCard board={board} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              searching={Boolean(query.q) || query.filter !== 'all'}
              orgId={org?.id ?? null}
              folderId={currentFolder?.id ?? null}
            />
          )}
        </main>
      </div>
    </div>
  );
}

async function EmptyState({
  searching,
  orgId,
  folderId,
}: {
  searching: boolean;
  orgId: string | null;
  folderId: string | null;
}) {
  const t = await getT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-background py-16 text-center">
      <LayoutGrid className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <p className="font-medium">{searching ? t('Ничего не найдено') : t('Здесь пока пусто')}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {searching
          ? 'Попробуйте изменить запрос или фильтр.'
          : t('Создайте первую доску — пустую или из шаблона.')}
      </p>
      {!searching ? <CreateBoardDialog orgId={orgId} folderId={folderId} /> : null}
    </div>
  );
}
