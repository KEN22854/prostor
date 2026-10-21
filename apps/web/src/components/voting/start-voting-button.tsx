'use client';

import { Loader2, Vote } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { errorMessage } from '@/lib/utils';
import { startVoting, useVotingStore } from '@/stores/voting-store';
import { useT } from '@/lib/i18n/client';

/** Запуск голосования (редакторы): тема и число голосов на человека */
export function StartVotingButton({ boardId }: { boardId: string }) {
  const t = useT();
  const active = useVotingStore((s) => s.voting?.status === 'active');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Что делаем первым?');
  const [votes, setVotes] = useState('3');
  const [pending, setPending] = useState(false);
  if (active) return null;

  async function start() {
    setPending(true);
    try {
      await startVoting(boardId, title.trim() || 'Голосование', Number(votes));
      setOpen(false);
      toast.success(t('Голосование началось: кликайте по объектам, чтобы отдать голос'));
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось начать голосование')));
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('Голосование')}>
          <Vote />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <p className="text-sm font-medium">{t('Новое голосование')}</p>
          <div className="space-y-1.5">
            <Label htmlFor="voting-title">{t('Вопрос')}</Label>
            <Input
              id="voting-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="voting-votes">{t('Голосов у каждого')}</Label>
            <NativeSelect
              id="voting-votes"
              value={votes}
              onChange={(e) => setVotes(e.target.value)}
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('Чужие голоса скрыты до завершения — так меньше эффекта «голосую за лидера».')}
          </p>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Vote />}
            {t('Начать')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
