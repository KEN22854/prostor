import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ApiKeysCard } from '@/components/settings/api-keys-card';
import { ChangePasswordForm } from '@/components/settings/change-password-form';
import { EmailNotificationsToggle } from '@/components/settings/email-notifications-toggle';
import { ProfileForm } from '@/components/settings/profile-form';
import { SignOutEverywhere } from '@/components/settings/sign-out-everywhere';
import { TwoFactorCard } from '@/components/settings/two-factor-card';
import { WebhooksCard } from '@/components/settings/webhooks-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSessionUser } from '@/lib/session';
import { getAccountOverview } from '@/services/profile';
import { twoFactorStatus } from '@/services/two-factor';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Настройки аккаунта') };
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  yandex: 'Яндекс',
  vk: 'VK ID',
};

export default async function AccountSettingsPage() {
  const t = await getT();
  const user = await getSessionUser();
  if (!user) redirect('/login?callbackUrl=/settings');
  const [account, twoFactor] = await Promise.all([
    getAccountOverview(user.id),
    twoFactorStatus(user.id),
  ]);
  const dateFmt = new Intl.DateTimeFormat('ru', { dateStyle: 'long', timeStyle: 'short' });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label={t('К списку досок')}>
            <Link href="/dashboard">
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="font-semibold">{t('Настройки аккаунта')}</h1>
        </div>
      </header>

      <main className="container max-w-2xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('Профиль')}</CardTitle>
            <CardDescription>{t('Имя видят участники ваших досок')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm name={account.name} email={account.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{account.hasPassword ? t('Пароль') : t('Установить пароль')}</CardTitle>
            <CardDescription>
              {account.hasPassword
                ? 'После смены пароля все остальные устройства будут отключены'
                : t('Вы входите через внешний сервис. Задайте пароль, чтобы входить и по email')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm email={account.email} hasPassword={account.hasPassword} />
          </CardContent>
        </Card>

        <Card id="security">
          <CardHeader>
            <CardTitle>{t('Двухфакторная аутентификация')}</CardTitle>
            <CardDescription>
              {t('Второй шаг при входе по паролю. Организация может сделать её обязательной')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TwoFactorCard
              enabled={twoFactor.enabled}
              backupCodesLeft={twoFactor.backupCodesLeft}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Уведомления')}</CardTitle>
          </CardHeader>
          <CardContent>
            <EmailNotificationsToggle initial={account.emailNotifications} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Язык интерфейса')}</CardTitle>
          </CardHeader>
          <CardContent>
            <LanguageSwitcher />
          </CardContent>
        </Card>

        <Card id="api">
          <CardHeader>
            <CardTitle>{t('API-ключи')}</CardTitle>
            <CardDescription>
              Доступ к доскам из своих программ и интеграций: REST API /api/v1 (документация — в
              README). Ключ действует от вашего имени и с вашими правами
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeysCard />
          </CardContent>
        </Card>

        <Card id="webhooks">
          <CardHeader>
            <CardTitle>{t('Вебхуки')}</CardTitle>
            <CardDescription>
              Простор отправит POST на ваш адрес при событиях досок: Slack, Telegram-бот, Jira,
              Zapier/Make
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WebhooksCard />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Вход и сессии')}</CardTitle>
            <CardDescription>
              Привязанные сервисы:{' '}
              {account.providers.length
                ? account.providers.map((p) => PROVIDER_LABELS[p] ?? p).join(', ')
                : t('нет')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Аккаунт создан {dateFmt.format(account.createdAt)}
              {account.lastLoginAt
                ? ` · последний вход ${dateFmt.format(account.lastLoginAt)}`
                : ''}
            </p>
            <SignOutEverywhere />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
