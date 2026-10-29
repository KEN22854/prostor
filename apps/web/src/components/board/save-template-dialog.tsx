'use client';

import { Building2, LayoutTemplate, Loader2, User } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { apiRequest } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';
import { cn, errorMessage } from '@/lib/utils';

/**
 * Сохранить доску как шаблон — для себя или для всей организации.
 * Шаблон появится в окне «Новая доска».
 */
export function SaveTemplateDialog({
  boardId,
  title,
  org,
}: {
  boardId: string;
  title: string;
  org: { id: string; name: string } | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'personal' | 'org'>(org ? 'org' : 'personal');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiRequest(`/api/boards/${boardId}/template`, {
        method: 'POST',
        body: { title: name, description, scope },
      });
      toast.success(
        scope === 'org'
          ? t('Шаблон сохранён — команда увидит его в «Новая доска»')
          : t('Шаблон сохранён — он появится в «Новая доска»'),
      );
      setOpen(false);
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось сохранить шаблон')));
    } finally {
      setSaving(false);
    }
  }

  const option = (value: 'personal' | 'org', icon: typeof User, label: string, hint: string) => {
    const Icon = icon;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={scope === value}
        onClick={() => setScope(value)}
        className={cn(
          'flex flex-1 items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200',
          scope === value ? 'shadow-soft border-primary bg-accent' : 'hover:border-primary/40',
        )}
      >
        <Icon className={cn('mt-0.5 size-4', scope === value && 'text-primary')} />
        <span>
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </button>
    );
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('Сохранить как шаблон')}
            onClick={() => {
              setName(title);
              setOpen(true);
            }}
          >
            <LayoutTemplate />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('Сохранить как шаблон')}</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Сохранить как шаблон')}</DialogTitle>
            <DialogDescription>
              {t('Новые доски можно будет начинать с копии этой: со всеми объектами и текстом')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">{t('Название')}</Label>
              <Input
                id="template-name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-description">{t('Описание')}</Label>
              <Textarea
                id="template-description"
                value={description}
                maxLength={500}
                placeholder={t('Когда пригодится шаблон (необязательно)')}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup">
              {option('personal', User, t('Только для меня'), t('Личный шаблон'))}
              {org
                ? option(
                    'org',
                    Building2,
                    t('Для команды'),
                    t('Всем участникам «{name}»', { name: org.name }),
                  )
                : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('Отмена')}
            </Button>
            <Button
              variant="gradient"
              disabled={saving || !name.trim()}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="animate-spin" /> : null}
              {t('Сохранить')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
