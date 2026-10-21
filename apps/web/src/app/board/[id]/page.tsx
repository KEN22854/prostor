import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma, resolveBoardAccess } from '@prostor/db';
import { BoardRoom } from '@/components/board/board-room';
import { aiCapabilities } from '@/lib/ai/capabilities';
import { getSessionUser } from '@/lib/session';
import { touchBoardVisit } from '@/services/boards';
import { orgRequires2faFor } from '@/services/orgs';
import { getT } from '@/lib/i18n/server';

interface BoardPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: BoardPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getSessionUser();
  const access = await resolveBoardAccess(prisma, id, user?.id ?? null);
  const t = await getT();
  // Название недоступной доски не раскрываем даже в <title>
  return { title: access?.title ?? t('Доска'), robots: { index: false } };
}

/**
 * Страница доски. Middleware её не защищает: публичные доски открываются
 * без входа. Права проверяются здесь (и повторно — на WS-сервере).
 */
export default async function BoardPage({ params }: BoardPageProps) {
  const t = await getT();
  const { id } = await params;
  const user = await getSessionUser();
  const access = await resolveBoardAccess(prisma, id, user?.id ?? null);

  if (!access) {
    if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/board/${id}`)}`);
    notFound();
  }

  if (await orgRequires2faFor(access.orgId, user?.id ?? null)) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-medium">
          {t('Организация требует двухфакторную аутентификацию')}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('Включите 2FA в настройках аккаунта — после этого доска откроется.')}
        </p>
        <Link
          href="/settings#security"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t('Включить 2FA')}
        </Link>
      </main>
    );
  }

  if (user) await touchBoardVisit(user.id, id);

  return (
    <BoardRoom
      boardId={id}
      title={access.title}
      initialRole={access.role}
      isAuthenticated={user !== null}
      ai={aiCapabilities()}
    />
  );
}
