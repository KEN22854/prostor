import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Button } from '@/components/ui/button';
import { getT } from '@/lib/i18n/server';

export const metadata: Metadata = {
  title: 'Новый пароль',
  // Токен в URL не должен утекать в Referer на внешние ресурсы
  referrer: 'no-referrer',
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const t = await getT();
  const { token } = await searchParams;

  // Формат проверяем сразу; валидность и срок действия — на сервере при отправке
  if (!token || token.length < 32 || token.length > 256) {
    return (
      <AuthCard
        title={t('Ссылка недействительна')}
        description={t('Похоже, ссылка повреждена или неполная.')}
      >
        <Button asChild className="w-full">
          <Link href="/forgot-password">{t('Запросить новую ссылку')}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('Новый пароль')} description={t('Придумайте новый пароль для входа')}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
