import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Восстановление пароля' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Восстановление пароля"
      description="Укажите email — пришлём ссылку для создания нового пароля"
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Вернуться ко входу
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
