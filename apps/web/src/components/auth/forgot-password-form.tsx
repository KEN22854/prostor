'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@prostor/shared';
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
import { ApiClientError, postJson } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';

export function ForgotPasswordForm() {
  const t = useT();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    try {
      await postJson('/api/account/forgot-password', values);
      setSentTo(values.email);
    } catch (error: unknown) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('Не удалось отправить письмо'),
      );
    }
  }

  if (sentTo) {
    // Текст одинаковый для существующих и несуществующих адресов
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <MailCheck className="size-10 text-primary" aria-hidden />
        <p className="text-sm">
          {t(
            'Если аккаунт {email} существует, мы отправили на него ссылку для сброса пароля. Проверьте почту и папку «Спам».',
            { email: sentTo },
          )}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setSentTo(null)}>
          {t('Отправить ещё раз')}
        </Button>
      </div>
    );
  }

  const submitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {t('Отправить ссылку')}
        </Button>
      </form>
    </Form>
  );
}
