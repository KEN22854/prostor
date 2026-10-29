'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Loader2, Plus, Trash2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  BOARD_TEMPLATES,
  LIMITS,
  type BoardTemplateDto,
  type BoardTemplateKey,
} from '@prostor/shared';
import { BoardThumbnail } from '@/components/dashboard/board-thumbnail';
import { TemplatePreview } from '@/components/dashboard/template-preview';
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
  // Свои шаблоны (личные и организаций) — подгружаются при открытии
  const [custom, setCustom] = useState<BoardTemplateDto[] | null>(null);
  const [customId, setCustomId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCustomId(null);
    apiRequest<{ templates: BoardTemplateDto[] }>('/api/templates')
      .then((r) => setCustom(r.templates))
      .catch(() => setCustom([]));
  }, [open]);

  async function removeTemplate(tpl: BoardTemplateDto) {
    try {
      await apiRequest(`/api/templates/${tpl.id}`, { method: 'DELETE' });
      setCustom((list) => list?.filter((x) => x.id !== tpl.id) ?? null);
      if (customId === tpl.id) setCustomId(null);
      toast.success(t('Шаблон удалён'));
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось удалить шаблон')));
    }
  }
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: 'Новая доска', templateKey: 'blank' },
  });

  async function onSubmit(values: Values) {
    try {
      const board = await apiRequest<{ id: string }>('/api/boards', {
        method: 'POST',
        body: {
          ...values,
          ...(customId ? { customTemplateId: customId } : {}),
          ...(folderId ? { folderId } : orgId ? { orgId } : {}),
        },
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
        <Button variant="gradient">
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
                        aria-checked={!customId && field.value === tpl.key}
                        onClick={() => {
                          setCustomId(null);
                          field.onChange(tpl.key);
                        }}
                        className={cn(
                          'overflow-hidden rounded-lg border text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          !customId && field.value === tpl.key
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
            {custom && custom.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('Свои шаблоны')}</p>
                <div
                  role="radiogroup"
                  className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3"
                >
                  {custom.map((tpl) => (
                    <div key={tpl.id} className="group relative animate-appear">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={customId === tpl.id}
                        onClick={() => setCustomId(tpl.id)}
                        className={cn(
                          'block w-full overflow-hidden rounded-lg border text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          customId === tpl.id
                            ? 'border-primary ring-2 ring-primary'
                            : 'hover:border-foreground/30',
                        )}
                      >
                        <TemplatePreview templateId={tpl.id} />
                        <span className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium">
                          {tpl.org ? (
                            <Building2
                              className="size-3 shrink-0 text-primary"
                              aria-label={tpl.org.name}
                            />
                          ) : (
                            <User className="size-3 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{tpl.title}</span>
                        </span>
                      </button>
                      {tpl.canDelete ? (
                        <button
                          type="button"
                          onClick={() => void removeTemplate(tpl)}
                          className="shadow-soft absolute right-1.5 top-1.5 rounded-md bg-background/90 p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                          aria-label={t('Удалить шаблон «{title}»', { title: tpl.title })}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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
