'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { LIMITS, type BoardListItem } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

const schema = z.object({
  title: z.string().trim().min(1, 'Введите название').max(LIMITS.maxBoardTitle),
});
type Values = z.infer<typeof schema>;

interface RenameBoardDialogProps {
  board: BoardListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameBoardDialog({ board, open, onOpenChange }: RenameBoardDialogProps) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: board.title },
  });

  useEffect(() => {
    if (open) form.reset({ title: board.title });
  }, [open, board.title, form]);

  async function onSubmit(values: Values) {
    try {
      await apiRequest(`/api/boards/${board.id}`, { method: 'PATCH', body: values });
      onOpenChange(false);
      router.refresh();
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Не удалось переименовать доску'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Переименовать доску</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
