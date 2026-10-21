'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

/** Переключатель писем об упоминаниях и ответах (в приложении уведомления приходят всегда) */
export function EmailNotificationsToggle({ initial }: { initial: boolean }) {
  const t = useT();
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function change(next: boolean) {
    setEnabled(next);
    setSaving(true);
    try {
      await apiRequest('/api/account/notifications', {
        method: 'PATCH',
        body: { emailNotifications: next },
      });
      toast.success(
        next ? t('Письма об упоминаниях включены') : t('Письма об упоминаниях выключены'),
      );
    } catch (e: unknown) {
      setEnabled(!next);
      toast.error(errorMessage(e, t('Не удалось сохранить настройку')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4"
        checked={enabled}
        disabled={saving}
        onChange={(e) => void change(e.target.checked)}
      />
      <span>
        <span className="block font-medium">{t('Письма об упоминаниях и ответах')}</span>
        <span className="block text-muted-foreground">
          Приходят, если вы не прочитали уведомление в Просторе в течение пары минут
        </span>
      </span>
    </label>
  );
}
