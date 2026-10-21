import { LayoutGrid, MailWarning, ShieldX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { prisma, resolveBoardAccess } from '@prostor/db';
import {
  INVITE_PROBLEM_TEXT,
  ROLE_HINTS,
  ROLE_LABELS,
  hasRole,
  joinBoardSchema,
} from '@prostor/shared';
import { AuthCard } from '@/components/auth/auth-card';
import { AcceptInviteButton } from '@/components/board/accept-invite-button';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/auth/actions';
import { getSessionUser } from '@/lib/session';
import { previewInvite } from '@/services/invites';
import { getT } from '@/lib/i18n/server';

export const metadata: Metadata = {
  title: 'Приглашение на доску',
  // Токен в URL не должен утечь в Referer и в поисковики
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

interface JoinPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

async function Shell({ children }: { children: ReactNode }) {
  const t = await getT();
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="container flex h-16 items-center">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {t('Простор')}
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        {children}
      </main>
    </div>
  );
}

/**
 * Страница приглашения. Принятие — отдельным действием (кнопка), а не при
 * открытии ссылки: превью ссылок в мессенджерах и почтовые сканеры не должны
 * «использовать» одноразовое приглашение.
 */
export default async function JoinPage({ params, searchParams }: JoinPageProps) {
  const t = await getT();
  const { id } = await params;
  const { token } = await searchParams;
  const user = await getSessionUser();

  const valid = joinBoardSchema.safeParse({ token });
  const preview = valid.success
    ? await previewInvite(id, valid.data.token, user?.email ?? null)
    : null;

  if (!valid.success || !preview) {
    return (
      <Shell>
        <AuthCard
          title={t('Приглашение не найдено')}
          description={t('Ссылка повреждена или приглашение удалено. Попросите прислать новое.')}
        >
          <ShieldX className="mx-auto size-10 text-muted-foreground" aria-hidden />
        </AuthCard>
      </Shell>
    );
  }

  const joinPath = `/board/${id}/join?token=${encodeURIComponent(valid.data.token)}`;

  if (preview.problem) {
    return (
      <Shell>
        <AuthCard
          title={`Доска «${preview.boardTitle}»`}
          description={INVITE_PROBLEM_TEXT[preview.problem]}
        >
          {preview.problem === 'wrong_email' ? (
            <div className="space-y-3 text-center text-sm">
              <MailWarning className="mx-auto size-10 text-amber-500" aria-hidden />
              <p className="text-muted-foreground">
                Вы вошли как <b>{user?.email}</b>.
              </p>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" className="w-full">
                  {t('Выйти и войти другим аккаунтом')}
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              {t('Попросите автора приглашения прислать новую ссылку.')}
            </p>
          )}
        </AuthCard>
      </Shell>
    );
  }

  const description = `${preview.inviterName ?? 'Коллега'} приглашает вас в роли «${ROLE_LABELS[preview.role]}». ${ROLE_HINTS[preview.role]}.`;

  if (!user) {
    const callback = encodeURIComponent(joinPath);
    return (
      <Shell>
        <AuthCard title={`Доска «${preview.boardTitle}»`} description={description}>
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href={`/register?callbackUrl=${callback}`}>
                {t('Зарегистрироваться и присоединиться')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/login?callbackUrl=${callback}`}>{t('У меня есть аккаунт')}</Link>
            </Button>
          </div>
          {preview.email ? (
            <p className="text-center text-xs text-muted-foreground">
              Приглашение для адреса {preview.email}
            </p>
          ) : null}
        </AuthCard>
      </Shell>
    );
  }

  // Уже есть доступ не ниже приглашения — принимать нечего
  const access = await resolveBoardAccess(prisma, id, user.id);
  if (access && hasRole(access.role, preview.role)) {
    return (
      <Shell>
        <AuthCard
          title={`Доска «${preview.boardTitle}»`}
          description={`У вас уже есть доступ: ${ROLE_LABELS[access.role].toLowerCase()}.`}
        >
          <Button asChild className="w-full">
            <Link href={`/board/${id}`}>
              <LayoutGrid /> {t('Открыть доску')}
            </Link>
          </Button>
        </AuthCard>
      </Shell>
    );
  }

  return (
    <Shell>
      <AuthCard title={`Доска «${preview.boardTitle}»`} description={description}>
        <AcceptInviteButton boardId={id} token={valid.data.token} />
        <p className="text-center text-xs text-muted-foreground">Вы войдёте как {user.email}</p>
      </AuthCard>
    </Shell>
  );
}
