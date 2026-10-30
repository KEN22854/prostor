'use client';

import { Check, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { PLANS, TRIAL_DAYS, periodPrice, type PaidPlan } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';
import { cn, errorMessage } from '@/lib/utils';

interface PricingPlansProps {
  signedIn: boolean;
  /** Организации, где пользователь — владелец или админ (для тарифа Team) */
  orgs: Array<{ id: string; name: string }>;
  trialAvailable: boolean;
  currentPlan?: string;
}

const FEATURES: Record<'FREE' | PaidPlan, string[]> = {
  FREE: [
    '3 личные доски',
    '20 ИИ-задач в месяц',
    'Совместная работа в реальном времени',
    'Созвоны, видео и аудио на доске',
  ],
  PRO: [
    'Без ограничения досок',
    '500 ИИ-задач в месяц',
    'Свои шаблоны и импорт из других досок',
    'Экспорт PNG, PDF, SVG',
  ],
  TEAM: [
    'Всё из Pro для каждого участника',
    '2000 ИИ-задач в месяц на человека',
    'Командные шаблоны и папки с правами',
    'Политики, аудит, SSO и 2FA',
  ],
};

/** Карточки тарифов с переключателем «месяц / год» — на странице тарифов и в настройках */
export function PricingPlans({ signedIn, orgs, trialAvailable, currentPlan }: PricingPlansProps) {
  const t = useT();
  const router = useRouter();
  const [months, setMonths] = useState<1 | 12>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '');

  async function buy(plan: PaidPlan) {
    if (!signedIn) {
      router.push(`/register?callbackUrl=${encodeURIComponent('/pricing')}`);
      return;
    }
    setBusy(plan);
    try {
      const { url } = await apiRequest<{ url: string }>('/api/billing/checkout', {
        method: 'POST',
        body: { plan, months, ...(plan === 'TEAM' ? { orgId } : {}) },
      });
      window.location.href = url;
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось перейти к оплате')));
      setBusy(null);
    }
  }

  async function trial() {
    setBusy('trial');
    try {
      await apiRequest('/api/billing/trial', { method: 'POST' });
      toast.success(t('Pro включён на {days} дней — пользуйтесь!', { days: TRIAL_DAYS }));
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось включить пробный период')));
    } finally {
      setBusy(null);
    }
  }

  const price = (plan: PaidPlan) => {
    const total = periodPrice(plan, months, 'RUB') / 100;
    return months === 12 ? Math.round(total / 12) : total;
  };

  const card = (id: 'FREE' | PaidPlan, i: number) => {
    const popular = id === 'PRO';
    const current = currentPlan === id;
    return (
      <div
        key={id}
        className={cn(
          'stagger shadow-soft relative flex flex-col rounded-3xl border bg-card p-6',
          popular ? 'lift shadow-glow border-2 border-primary/60' : 'lift',
        )}
        style={{ '--i': i } as CSSProperties}
      >
        {popular ? (
          <span className="bg-brand-gradient shadow-glow absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-semibold text-white">
            {t('Популярный')}
          </span>
        ) : null}
        <h3 className="text-lg font-semibold">{PLANS[id].name}</h3>
        <p className="mt-3 flex items-end gap-1">
          <span className="text-4xl font-bold tracking-tight">
            {id === 'FREE' ? '0 ₽' : `${price(id).toLocaleString('ru-RU')} ₽`}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">
            {id === 'FREE' ? t('навсегда') : id === 'TEAM' ? t('/ мес за команду') : t('/ мес')}
          </span>
        </p>
        {months === 12 && id !== 'FREE' ? (
          <p className="mt-1 text-xs text-primary">{t('При оплате за год — 2 месяца в подарок')}</p>
        ) : (
          <p className="mt-1 text-xs text-transparent" aria-hidden>
            .
          </p>
        )}
        <ul className="my-6 flex-1 space-y-2.5 text-sm">
          {FEATURES[id].map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t(f)}
            </li>
          ))}
        </ul>
        {id === 'TEAM' && signedIn && orgs.length > 1 ? (
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="mb-3 h-9 rounded-lg border bg-background px-2 text-sm"
            aria-label={t('Организация')}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
        {id === 'FREE' ? (
          <Button asChild variant="outline" disabled={current}>
            <Link href={signedIn ? '/dashboard' : '/register'}>
              {current ? t('Ваш тариф') : signedIn ? t('К доскам') : t('Начать бесплатно')}
            </Link>
          </Button>
        ) : (
          <div className="space-y-2">
            {id === 'PRO' && signedIn && trialAvailable ? (
              <Button
                variant="gradient"
                className="w-full"
                disabled={busy !== null}
                onClick={() => void trial()}
              >
                {busy === 'trial' ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {t('{days} дней бесплатно', { days: TRIAL_DAYS })}
              </Button>
            ) : null}
            <Button
              variant={id === 'PRO' && !(signedIn && trialAvailable) ? 'gradient' : 'outline'}
              className="w-full"
              disabled={busy !== null || (id === 'TEAM' && signedIn && orgs.length === 0)}
              onClick={() => void buy(id)}
            >
              {busy === id ? <Loader2 className="animate-spin" /> : null}
              {current ? t('Продлить') : t('Оплатить')}
            </Button>
            {id === 'TEAM' && signedIn && orgs.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                {t('Сначала создайте организацию на дашборде')}
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <div
          className="shadow-soft inline-flex rounded-full border bg-background/70 p-1 backdrop-blur"
          role="radiogroup"
        >
          {([1, 12] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={months === m}
              onClick={() => setMonths(m)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-300',
                months === m
                  ? 'shadow-glow bg-primary text-primary-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {m === 1 ? t('Помесячно') : t('За год −17%')}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {(['FREE', 'PRO', 'TEAM'] as const).map(card)}
      </div>
    </div>
  );
}
