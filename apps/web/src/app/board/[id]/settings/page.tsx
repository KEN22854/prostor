import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma, resolveBoardAccess } from '@prostor/db';
import { can } from '@prostor/shared';
import { AuditLogView } from '@/components/audit/audit-log-view';
import { BoardDangerZone } from '@/components/settings/board-danger-zone';
import { BoardDetailsForm } from '@/components/settings/board-details-form';
import { SharingPanel } from '@/components/sharing/sharing-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSessionUser } from '@/lib/session';
import { getT } from '@/lib/i18n/server';

interface BoardSettingsPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: 'Настройки доски', robots: { index: false } };

/** Настройки доски: описание, участники и доступ, удаление/выход */
export default async function BoardSettingsPage({ params }: BoardSettingsPageProps) {
  const t = await getT();
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(`/board/${id}/settings`)}`);

  const access = await resolveBoardAccess(prisma, id, user.id);
  if (!access) notFound();

  const [board, membership] = await Promise.all([
    prisma.board.findUniqueOrThrow({ where: { id }, select: { description: true } }),
    prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: id, userId: user.id } },
      select: { userId: true },
    }),
  ]);
  const isOwner = access.ownerId === user.id;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label={t('Вернуться к доске')}>
            <Link href={`/board/${id}`}>
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="min-w-0 truncate font-semibold">Настройки · {access.title}</h1>
        </div>
      </header>

      <main className="container max-w-2xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('Основное')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BoardDetailsForm
              boardId={id}
              title={access.title}
              description={board.description}
              canEdit={can(access.role, 'edit', access.policy)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Участники и доступ')}</CardTitle>
            <CardDescription>
              {t('Приглашения по ссылке и email, роли и видимость доски')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SharingPanel boardId={id} defaultTab="members" />
          </CardContent>
        </Card>

        {isOwner ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('Журнал действий')}</CardTitle>
              <CardDescription>
                Кто менял доступ, экспортировал, восстанавливал версии
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLogView endpoint={`/api/boards/${id}/audit`} />
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">
              {isOwner ? t('Удаление доски') : t('Покинуть доску')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BoardDangerZone
              boardId={id}
              title={access.title}
              userId={user.id}
              isOwner={isOwner}
              isMember={membership !== null}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
