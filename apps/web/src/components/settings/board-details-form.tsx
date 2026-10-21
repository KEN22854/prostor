'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { LIMITS } from '@prostor/shared';
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
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

const schema = z.object({
  title: z.string().trim().min(1, 'Введите название').max(LIMITS.maxBoardTitle),
  description: z.string().trim().max(2_000),
});
type Values = z.infer<typeof schema>;

interface BoardDetailsFormProps {
  boardId: string;
  title: string;
  description: string | null;
  canEdit: boolean;
}

export function BoardDetailsForm({ boardId, title, description, canEdit }: BoardDetailsFormProps) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title, description: description ?? '' },
  });

  async function onSubmit(values: Values) {
    try {
      await apiRequest(`/api/boards/${boardId}`, {
        method: 'PATCH',
        body: { title: values.title, description: values.description || null },
      });
      form.reset(values);
      toast.success('Сохранено');
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось сохранить'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <fieldset disabled={!canEdit} className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Название</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Описание</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="О чём эта доска" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        {canEdit ? (
          <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
            {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
            Сохранить
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Изменять название могут редакторы и владелец.
          </p>
        )}
      </form>
    </Form>
  );
}
