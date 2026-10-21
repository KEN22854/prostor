'use client';

import { Loader2, MonitorX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/auth/actions';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

/** Инвалидирует все JWT пользователя, затем чистит cookie на этом устройстве */
export function SignOutEverywhere() {
  const t = useT();
  const [pending, setPending] = useState(false);

  async function run() {
    if (!window.confirm('Выйти на всех устройствах, включая это?')) return;
    setPending(true);
    try {
      await apiRequest('/api/account/sessions', { method: 'DELETE' });
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось завершить сессии')));
      setPending(false);
      return;
    }
    // Server Action удаляет cookie и делает redirect на главную
    await signOutAction();
  }

  return (
    <Button variant="outline" onClick={() => void run()} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <MonitorX />}
      {t('Выйти на всех устройствах')}
    </Button>
  );
}
