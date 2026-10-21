'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { changePasswordSchema, type ChangePasswordInput } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ApiClientError, apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

interface ChangePasswordFormProps {
  email: string;
  /** false — аккаунт создан через OAuth, пароль задаётся впервые */
  hasPassword: boolean;
}

/**
 * Смена пароля гасит все сессии (sessionVersion++), поэтому сразу
 * входим заново с новым паролем — пользователь остаётся в системе.
 */
export function ChangePasswordForm({ email, hasPassword }: ChangePasswordFormProps) {
  const router = useRouter();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: ChangePasswordInput) {
    try {
      await apiRequest('/api/account/password', {
        method: 'POST',
        body: { ...values, currentPassword: hasPassword ? values.currentPassword : undefined },
      });
    } catch (e: unknown) {
      const fieldError = e instanceof ApiClientError ? e.fields.currentPassword : undefined;
      if (fieldError) form.setError('currentPassword', { message: fieldError });
      else toast.error(errorMessage(e, 'Не удалось сменить пароль'));
      return;
    }
    const result = await signIn('credentials', {
      email,
      password: values.password,
      redirect: false,
    });
    if (!result || result.error) {
      toast.success('Пароль изменён. Войдите с новым паролем');
      router.push('/login');
      return;
    }
    form.reset();
    toast.success(
      hasPassword ? 'Пароль изменён, другие устройства отключены' : 'Пароль установлен',
    );
    router.refresh();
  }

  const submitting = form.formState.isSubmitting;
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Скрытое поле помогает менеджерам паролей сохранить новую пару */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        {hasPassword ? (
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Текущий пароль</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Новый пароль</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Повторите пароль</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {hasPassword ? 'Сменить пароль' : 'Установить пароль'}
        </Button>
      </form>
    </Form>
  );
}
