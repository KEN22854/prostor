import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { RegisterForm } from '@/components/auth/register-form';
import { Button } from '@/components/ui/button';
import { enabledOAuthProviders } from '@/lib/auth/oauth-providers';
import { env } from '@/lib/env';
import { safeCallbackUrl } from '@/lib/safe-redirect';

export const metadata: Metadata = { title: 'Регистрация' };

interface RegisterPageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { callbackUrl: rawCallback } = await searchParams;
  const callbackUrl = safeCallbackUrl(rawCallback);
  const e = env();

  if (!e.ALLOW_SIGNUP) {
    return (
      <AuthCard
        title="Регистрация закрыта"
        description="На этом сервере аккаунты создаются только по приглашению администратора."
      >
        <Button asChild className="w-full">
          <Link href="/login">Ко входу</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Регистрация"
      description="Создайте аккаунт — это бесплатно"
      footer={
        <span>
          Уже есть аккаунт?{' '}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-medium text-primary hover:underline"
          >
            Войти
          </Link>
        </span>
      }
    >
      <OAuthButtons providers={enabledOAuthProviders(e)} callbackUrl={callbackUrl} />
      <RegisterForm callbackUrl={callbackUrl} />
    </AuthCard>
  );
}
