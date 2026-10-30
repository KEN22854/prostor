import type { Metadata } from 'next';
import { prisma } from '@prostor/db';
import { Aurora, Logo } from '@/components/brand/logo';
import { PricingPlans } from '@/components/billing/pricing-plans';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { getSessionUser } from '@/lib/session';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Тарифы') };
}

/** Публичная страница тарифов */
export default async function PricingPage() {
  const t = await getT();
  const user = await getSessionUser();
  const me = user
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          trialUsedAt: true,
          orgMemberships: {
            where: { role: { in: ['OWNER', 'ADMIN'] } },
            select: { org: { select: { id: true, name: true } } },
          },
        },
      })
    : null;
  return (
    <main className="relative min-h-screen overflow-hidden">
      <Aurora />
      <header className="container relative z-10 flex h-20 items-center justify-between">
        <Logo href={user ? '/dashboard' : '/'} label={t('Простор')} />
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:flex" />
          <ThemeToggle />
        </div>
      </header>
      <section className="container relative z-10 max-w-5xl space-y-10 pb-24 pt-8">
        <div className="animate-fade-up space-y-3 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t('Тарифы')} <span className="text-gradient">{t('для любой команды')}</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            {t('Начните бесплатно, а Pro можно попробовать 14 дней без оплаты')}
          </p>
        </div>
        <PricingPlans
          signedIn={user !== null}
          orgs={me?.orgMemberships.map((m) => m.org) ?? []}
          trialAvailable={me ? me.trialUsedAt === null : true}
        />
        <p className="text-center text-xs text-muted-foreground">
          {t(
            'Оплата картой или СБП через ЮKassa, за рубежом — через Stripe. Без автосписаний: продлевайте, когда удобно',
          )}
        </p>
      </section>
    </main>
  );
}
