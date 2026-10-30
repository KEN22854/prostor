'use client';

import { CreditCard, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';
import { errorMessage } from '@/lib/utils';

/** Тестовая «страница оплаты» (BILLING_MOCK) — вместо ЮKassa/Stripe при разработке */
function MockCheckout() {
  const t = useT();
  const router = useRouter();
  const payment = useSearchParams().get('payment') ?? '';
  const [busy, setBusy] = useState(false);
  const finish = async (ok: boolean) => {
    setBusy(true);
    try {
      await apiRequest('/api/billing/mock', { method: 'POST', body: { paymentId: payment, ok } });
      router.push(`/settings/billing?payment=${payment}`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось завершить тестовую оплату')));
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-accent/50 p-4">
      <div className="glass shadow-soft-lg w-full max-w-sm animate-fade-up space-y-4 rounded-3xl p-6 text-center">
        <span className="bg-brand-gradient shadow-glow mx-auto flex size-14 items-center justify-center rounded-2xl text-white">
          <CreditCard />
        </span>
        <h1 className="text-xl font-semibold">{t('Тестовая оплата')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('Это режим разработки: деньги не списываются. Выберите результат платежа')}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => void finish(false)}
          >
            {t('Отменить')}
          </Button>
          <Button
            variant="gradient"
            className="flex-1"
            disabled={busy}
            onClick={() => void finish(true)}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t('Оплатить')}
          </Button>
        </div>
      </div>
    </main>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense>
      <MockCheckout />
    </Suspense>
  );
}
