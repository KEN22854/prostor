import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Новый пароль',
  // Токен в URL не должен утекать в Referer на внешние ресурсы
  referrer: 'no-referrer',
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;

  // Формат проверяем сразу; валидность и срок действия — на сервере при отправке
  if (!token || token.length < 32 || token.length > 256) {
    return (
      <AuthCard
        title="Ссылка недействительна"
        description="Похоже, ссылка повреждена или неполная."
      >
        <Button asChild className="w-full">
          <Link href="/forgot-password">Запросить новую ссылку</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Новый пароль" description="Придумайте новый пароль для входа">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
