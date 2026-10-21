import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { authErrorMessage } from '@/lib/auth/messages';
import { enabledOAuthProviders } from '@/lib/auth/oauth-providers';
import { env } from '@/lib/env';
import { safeCallbackUrl } from '@/lib/safe-redirect';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Вход') };
}

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string; code?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getT();
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  // Ошибки OAuth приходят редиректом: ?error=OAuthAccountNotLinked
  const oauthError = authErrorMessage(params.code ?? params.error);
  const e = env();

  return (
    <AuthCard
      title={t('Вход')}
      description={t('Войдите, чтобы открыть свои доски')}
      footer={
        e.ALLOW_SIGNUP ? (
          <span>
            Нет аккаунта?{' '}
            <Link
              href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-medium text-primary hover:underline"
            >
              {t('Зарегистрироваться')}
            </Link>
          </span>
        ) : null
      }
    >
      {oauthError ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {oauthError}
        </p>
      ) : null}
      <OAuthButtons providers={enabledOAuthProviders(e)} callbackUrl={callbackUrl} />
      <LoginForm callbackUrl={callbackUrl} />
    </AuthCard>
  );
}
