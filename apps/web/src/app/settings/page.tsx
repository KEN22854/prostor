import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChangePasswordForm } from '@/components/settings/change-password-form';
import { EmailNotificationsToggle } from '@/components/settings/email-notifications-toggle';
import { ProfileForm } from '@/components/settings/profile-form';
import { SignOutEverywhere } from '@/components/settings/sign-out-everywhere';
import { TwoFactorCard } from '@/components/settings/two-factor-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSessionUser } from '@/lib/session';
import { getAccountOverview } from '@/services/profile';
import { twoFactorStatus } from '@/services/two-factor';

export const metadata: Metadata = { title: 'Настройки аккаунта' };

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  yandex: 'Яндекс',
  vk: 'VK ID',
};

export default async function AccountSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?callbackUrl=/settings');
  const [account, twoFactor] = await Promise.all([getAccountOverview(user.id), twoFactorStatus(user.id)]);
  const dateFmt = new Intl.DateTimeFormat('ru', { dateStyle: 'long', timeStyle: 'short' });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="К списку досок">
            <Link href="/dashboard">
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="font-semibold">Настройки аккаунта</h1>
        </div>
      </header>

      <main className="container max-w-2xl space-y-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Профиль</CardTitle>
            <CardDescription>Имя видят участники ваших досок</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm name={account.name} email={account.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{account.hasPassword ? 'Пароль' : 'Установить пароль'}</CardTitle>
            <CardDescription>
              {account.hasPassword
                ? 'После смены пароля все остальные устройства будут отключены'
                : 'Вы входите через внешний сервис. Задайте пароль, чтобы входить и по email'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm email={account.email} hasPassword={account.hasPassword} />
          </CardContent>
        </Card>

        <Card id="security">
          <CardHeader>
            <CardTitle>Двухфакторная аутентификация</CardTitle>
            <CardDescription>Второй шаг при входе по паролю. Организация может сделать её обязательной</CardDescription>
          </CardHeader>
          <CardContent>
            <TwoFactorCard enabled={twoFactor.enabled} backupCodesLeft={twoFactor.backupCodesLeft} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Уведомления</CardTitle>
          </CardHeader>
          <CardContent>
            <EmailNotificationsToggle initial={account.emailNotifications} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Вход и сессии</CardTitle>
            <CardDescription>
              Привязанные сервисы:{' '}
              {account.providers.length
                ? account.providers.map((p) => PROVIDER_LABELS[p] ?? p).join(', ')
                : 'нет'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Аккаунт создан {dateFmt.format(account.createdAt)}
              {account.lastLoginAt ? ` · последний вход ${dateFmt.format(account.lastLoginAt)}` : ''}
            </p>
            <SignOutEverywhere />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
