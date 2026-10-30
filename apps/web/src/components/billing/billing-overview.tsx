'use client';

import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { BillingOverview as Overview } from '@prostor/shared';
import { PricingPlans } from '@/components/billing/pricing-plans';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/fetcher';
import { useLocale, useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const t = useT();
  const ratio = limit ? Math.min(1, used / limit) : 0.08;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {used} / {limit ?? t('без лимита')}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-smooth',
            limit && ratio >= 1 ? 'bg-destructive' : 'bg-brand-gradient',
          )}
          style={{ width: `${Math.max(4, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Возврат со страницы оплаты: ждём вебхук провайдера и показываем результат */
function PaymentReturn({ id, onDone }: { id: string; onDone: () => void }) {
  const t = useT();
  const [status, setStatus] = useState<string>('PENDING');
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      const p = await apiRequest<{ status: string }>(`/api/billing/payments/${id}`).catch(
        () => null,
      );
      if (p) setStatus(p.status);
      if ((p && p.status !== 'PENDING') || tries > 40) {
        clearInterval(timer);
        onDone();
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [id, onDone]);
  const view =
    status === 'SUCCEEDED'
      ? {
          icon: CheckCircle2,
          text: t('Оплата прошла — тариф уже действует'),
          cls: 'text-green-600',
        }
      : status === 'CANCELED'
        ? { icon: XCircle, text: t('Платёж отменён'), cls: 'text-destructive' }
        : { icon: Loader2, text: t('Ждём подтверждения оплаты…'), cls: 'text-primary' };
  const Icon = view.icon;
  return (
    <div className="shadow-soft flex animate-fade-up items-center gap-3 rounded-2xl border bg-card p-4">
      <Icon className={cn('size-6', view.cls, status === 'PENDING' && 'animate-spin')} />
      <span className="font-medium">{view.text}</span>
    </div>
  );
}

export function BillingOverview({ orgs }: { orgs: Array<{ id: string; name: string }> }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const payment = useSearchParams().get('payment');
  const [data, setData] = useState<Overview | null>(null);
  const reload = () => {
    void apiRequest<Overview>('/api/billing')
      .then(setData)
      .catch(() => undefined);
    router.refresh();
  };
  useEffect(() => {
    void apiRequest<Overview>('/api/billing')
      .then(setData)
      .catch(() => undefined);
  }, []);

  if (!data) return <div className="skeleton h-64 rounded-2xl" />;
  if (!data.enabled)
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('Тариф')}</CardTitle>
          <CardDescription>
            {t('На этом сервере тарифы не используются — все возможности доступны без ограничений')}
          </CardDescription>
        </CardHeader>
      </Card>
    );

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  return (
    <div className="space-y-6">
      {payment ? <PaymentReturn id={payment} onDone={reload} /> : null}
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('Ваш тариф')}:{' '}
            <span className="text-gradient">
              {{ FREE: 'Free', PRO: 'Pro', TEAM: 'Team', ENTERPRISE: 'Enterprise' }[data.plan]}
            </span>
            {data.trial ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                {t('пробный период')}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            {data.until ? (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />{' '}
                {t('Действует до {date}', { date: date(data.until) })}
              </span>
            ) : data.plan === 'TEAM' || data.plan === 'ENTERPRISE' ? (
              t('Тариф вашей организации')
            ) : (
              t('Бесплатный тариф — без срока')
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Meter label={t('Личные доски')} used={data.usage.boards} limit={data.usage.boardLimit} />
          <Meter
            label={t('ИИ-задачи в этом месяце')}
            used={data.usage.ai}
            limit={data.usage.aiLimit}
          />
        </CardContent>
      </Card>

      <PricingPlans
        signedIn
        orgs={orgs}
        trialAvailable={data.trialAvailable}
        currentPlan={data.plan}
      />
      {data.providers.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          {t('Оплата ещё не подключена администратором сервера — доступен только пробный период')}
        </p>
      ) : null}

      {data.payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('История платежей')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {p.plan === 'TEAM' ? 'Team' : 'Pro'} · {p.months === 12 ? t('год') : t('месяц')}
                    <span className="ml-2 text-muted-foreground">{date(p.createdAt)}</span>
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {(p.amount / 100).toLocaleString('ru-RU')} {p.currency === 'RUB' ? '₽' : '$'}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        p.status === 'SUCCEEDED'
                          ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                          : p.status === 'CANCELED'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {p.status === 'SUCCEEDED'
                        ? t('оплачен')
                        : p.status === 'CANCELED'
                          ? t('отменён')
                          : t('ожидает')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
