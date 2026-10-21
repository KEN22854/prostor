import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { RegisterForm } from '@/components/auth/register-form';
import { Button } from '@/components/ui/button';
import { enabledOAuthProviders } from '@/lib/auth/oauth-providers';
import { env } from '@/lib/env';
import { safeCallbackUrl } from '@/lib/safe-redirect';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Регистрация') };
}

interface RegisterPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const t = await getT();
  const { callbackUrl: rawCallback } = await searchParams;
  const callbackUrl = safeCallbackUrl(rawCallback);
  const e = env();

  if (!e.ALLOW_SIGNUP) {
    return (
      <AuthCard
        title={t('Регистрация закрыта')}
        description={t('На этом сервере аккаунты создаются только по приглашению администратора.')}
      >
        <Button asChild className="w-full">
          <Link href="/login">{t('Ко входу')}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('Регистрация')}
      description={t('Создайте аккаунт — это бесплатно')}
      footer={
        <span>
          Уже есть аккаунт?{' '}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-medium text-primary hover:underline"
          >
            {t('Войти')}
          </Link>
        </span>
      }
    >
      <OAuthButtons providers={enabledOAuthProviders(e)} callbackUrl={callbackUrl} />
      <RegisterForm callbackUrl={callbackUrl} />
    </AuthCard>
  );
}
