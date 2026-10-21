'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { updateProfileSchema, type UpdateProfileInput } from '@prostor/shared';
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
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

export function ProfileForm({ name, email }: { name: string | null; email: string }) {
  const router = useRouter();
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: name ?? '' },
  });

  async function onSubmit(values: UpdateProfileInput) {
    try {
      await apiRequest('/api/account/profile', { method: 'PATCH', body: values });
      form.reset(values);
      toast.success('Профиль сохранён');
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось сохранить профиль'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Имя</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={email} readOnly disabled />
        </div>
        <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
          {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
          Сохранить
        </Button>
      </form>
    </Form>
  );
}
