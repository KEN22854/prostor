'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { BOARD_TEMPLATES, LIMITS, type BoardTemplateKey } from '@prostor/shared';
import { BoardThumbnail } from '@/components/dashboard/board-thumbnail';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { cn, errorMessage } from '@/lib/utils';

const templateKeys = BOARD_TEMPLATES.map((t) => t.key) as [BoardTemplateKey, ...BoardTemplateKey[]];
const schema = z.object({
  title: z.string().trim().min(1, 'Введите название').max(LIMITS.maxBoardTitle),
  templateKey: z.enum(templateKeys),
});
type Values = z.infer<typeof schema>;

interface CreateBoardDialogProps {
  /** Текущее рабочее пространство дашборда — доска создаётся в нём */
  orgId?: string | null;
  folderId?: string | null;
}

export function CreateBoardDialog({ orgId = null, folderId = null }: CreateBoardDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: 'Новая доска', templateKey: 'blank' },
  });

  async function onSubmit(values: Values) {
    try {
      const board = await apiRequest<{ id: string }>('/api/boards', {
        method: 'POST',
        body: { ...values, ...(folderId ? { folderId } : orgId ? { orgId } : {}) },
      });
      setOpen(false);
      form.reset();
      router.push(`/board/${board.id}`);
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Не удалось создать доску'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Новая доска
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Новая доска</DialogTitle>
          <DialogDescription>Начните с чистого листа или выберите шаблон.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} onFocus={(e) => e.currentTarget.select()} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="templateKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Шаблон</FormLabel>
                  <div role="radiogroup" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {BOARD_TEMPLATES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        role="radio"
                        aria-checked={field.value === t.key}
                        onClick={() => field.onChange(t.key)}
                        className={cn(
                          'overflow-hidden rounded-lg border text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          field.value === t.key
                            ? 'border-primary ring-2 ring-primary'
                            : 'hover:border-foreground/30',
                        )}
                      >
                        <BoardThumbnail id={t.key} templateKey={t.key} thumbnailUrl={null} />
                        <span className="block truncate px-2 py-1.5 text-xs font-medium">
                          {t.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Создать
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
