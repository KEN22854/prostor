import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Восстановление пароля') };
}

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <AuthCard
      title={t('Восстановление пароля')}
      description={t('Укажите email — пришлём ссылку для создания нового пароля')}
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('Вернуться ко входу')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
