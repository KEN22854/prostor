'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { emailSchema } from '@prostor/shared';
import { PasswordInput } from '@/components/auth/password-input';
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
import { authErrorMessage } from '@/lib/auth/messages';

// Клиентская схема мягче серверной: правила сложности пароля
// проверяются при регистрации, а не при входе.
const formSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Введите пароль'),
});
type FormValues = z.infer<typeof formSchema>;

interface LoginFormProps {
  callbackUrl: string;
}

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  // Второй шаг: пароль верный, нужен код 2FA
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const result = await signIn('credentials', {
        ...values,
        ...(needCode && code.trim() ? { totp: code.trim() } : {}),
        redirect: false,
      });
      if (!result || result.error) {
        const errorCode = result?.code ?? result?.error ?? 'invalid_credentials';
        if (errorCode === 'two_factor_required') {
          setNeedCode(true);
          return;
        }
        setFormError(authErrorMessage(errorCode));
        return;
      }
      router.push(callbackUrl);
      // Обновляем Server Components, которые уже отрисованы без сессии
      router.refresh();
    } catch (error: unknown) {
      console.error(error);
      toast.error('Не удалось войти. Проверьте соединение и попробуйте ещё раз');
    }
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Пароль</FormLabel>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  Забыли пароль?
                </Link>
              </div>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {needCode ? (
          <div className="space-y-2">
            <label htmlFor="totp" className="text-sm font-medium">
              Код из приложения-аутентификатора
            </label>
            <Input
              id="totp"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456 или резервный код"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Нет доступа к телефону — введите один из резервных кодов.</p>
          </div>
        ) : null}

        {formError ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {needCode ? 'Подтвердить' : 'Войти'}
        </Button>
      </form>
    </Form>
  );
}
