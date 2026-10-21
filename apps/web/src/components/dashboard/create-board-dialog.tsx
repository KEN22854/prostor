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
import { useT } from '@/lib/i18n/client';

const templateKeys = BOARD_TEMPLATES.map((tpl) => tpl.key) as [
  BoardTemplateKey,
  ...BoardTemplateKey[],
];
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
  const t = useT();
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
      toast.error(errorMessage(error, t('Не удалось создать доску')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> {t('Новая доска')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Новая доска')}</DialogTitle>
          <DialogDescription>{t('Начните с чистого листа или выберите шаблон.')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Название')}</FormLabel>
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
                  <FormLabel>{t('Шаблон')}</FormLabel>
                  <div role="radiogroup" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {BOARD_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.key}
                        type="button"
                        role="radio"
                        aria-checked={field.value === tpl.key}
                        onClick={() => field.onChange(tpl.key)}
                        className={cn(
                          'overflow-hidden rounded-lg border text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          field.value === tpl.key
                            ? 'border-primary ring-2 ring-primary'
                            : 'hover:border-foreground/30',
                        )}
                      >
                        <BoardThumbnail id={tpl.key} templateKey={tpl.key} thumbnailUrl={null} />
                        <span className="block truncate px-2 py-1.5 text-xs font-medium">
                          {tpl.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('Отмена')}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                {t('Создать')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
