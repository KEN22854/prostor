'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

/** Принять приглашение и перейти на доску */
export function AcceptInviteButton({ boardId, token }: { boardId: string; token: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    try {
      await apiRequest(`/api/boards/${boardId}/join`, { method: 'POST', body: { token } });
      toast.success(t('Вы присоединились к доске'));
      // replace: ссылка с токеном не остаётся в истории браузера
      router.replace(`/board/${boardId}`);
    } catch (error: unknown) {
      toast.error(errorMessage(error, t('Не удалось принять приглашение')));
      setPending(false);
    }
  }

  return (
    <Button className="w-full" onClick={() => void accept()} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {t('Присоединиться к доске')}
    </Button>
  );
}
