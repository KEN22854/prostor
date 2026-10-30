import { toast } from 'sonner';
import { ApiClientError } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

/**
 * Ошибка «упёрлись в лимит тарифа» (402) — уведомление с кнопкой «Тарифы»;
 * остальные ошибки — обычным уведомлением. Возвращает true, если это был лимит.
 */
export function toastApiError(
  error: unknown,
  fallback: string,
  labels: { plans: string },
): boolean {
  if (error instanceof ApiClientError && error.code === 'plan_limit') {
    toast.error(error.message, {
      duration: 10_000,
      action: { label: labels.plans, onClick: () => window.location.assign('/settings/billing') },
    });
    return true;
  }
  toast.error(errorMessage(error, fallback));
  return false;
}
