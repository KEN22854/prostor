'use client';

import { Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/fetcher';
import { cn, errorMessage } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

export function FavoriteButton({ boardId, isFavorite }: { boardId: string; isFavorite: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Звёздочка переключается мгновенно, сервер подтверждает в фоне
  const [optimistic, setOptimistic] = useOptimistic(isFavorite);

  function toggle() {
    startTransition(async () => {
      const next = !optimistic;
      setOptimistic(next);
      try {
        await apiRequest(`/api/boards/${boardId}/favorite`, { method: next ? 'PUT' : 'DELETE' });
        router.refresh();
      } catch (error: unknown) {
        toast.error(errorMessage(error, t('Не удалось обновить избранное')));
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={toggle}
      disabled={pending}
      aria-pressed={optimistic}
      aria-label={optimistic ? t('Убрать из избранного') : t('В избранное')}
    >
      <Star className={cn(optimistic && 'fill-amber-400 text-amber-500')} />
    </Button>
  );
}
