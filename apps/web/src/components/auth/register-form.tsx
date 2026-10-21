'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { registerSchema, type RegisterInput } from '@prostor/shared';
import { PasswordInput } from '@/components/auth/password-input';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ApiClientError, postJson } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';

interface RegisterFormProps {
  callbackUrl: string;
}

export function RegisterForm({ callbackUrl }: RegisterFormProps) {
  const t = useT();
  const router = useRouter();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: RegisterInput) {
    try {
      await postJson<{ id: string }>('/api/account/register', values);
    } catch (error: unknown) {
      if (error instanceof ApiClientError) {
        // Серверные ошибки полей (например, «email занят») — прямо под полями
        for (const [field, message] of Object.entries(error.fields)) {
          if (field in values) form.setError(field as keyof RegisterInput, { message });
        }
        if (Object.keys(error.fields).length === 0) toast.error(error.message);
        return;
      }
      toast.error(t('Не удалось зарегистрироваться'));
      return;
    }

    // Аккаунт создан — сразу входим тем же паролем
    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (!result || result.error) {
      toast.success(t('Аккаунт создан. Войдите с вашим паролем'));
      router.push('/login');
      return;
    }
    toast.success(t('Добро пожаловать в Простор!'));
    router.push(callbackUrl);
    router.refresh();
  }

  const submitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Имя')}</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder={t('Анна Смирнова')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="you@company.ru" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Пароль')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>{t('Минимум 8 символов, буквы и цифры')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Повторите пароль')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {t('Создать аккаунт')}
        </Button>
      </form>
    </Form>
  );
}
