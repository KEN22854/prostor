import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { prisma } from '@prostor/db';
import { BillingOverview } from '@/components/billing/billing-overview';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/lib/session';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Тариф и оплата') };
}

/** Тариф: использование лимитов, пробный период, оплата и история платежей */
export default async function BillingPage() {
  const t = await getT();
  const user = await getSessionUser();
  if (!user) redirect('/login?callbackUrl=/settings/billing');
  const managed = await prisma.orgMember.findMany({
    where: { userId: user.id, role: { in: ['OWNER', 'ADMIN'] } },
    select: { org: { select: { id: true, name: true } } },
  });
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/40">
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
        <div className="container flex h-14 max-w-5xl items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label={t('Назад')}>
            <Link href="/settings">
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="font-semibold">{t('Тариф и оплата')}</h1>
        </div>
      </header>
      <main className="container max-w-5xl py-8">
        <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}>
          <BillingOverview orgs={managed.map((m) => m.org)} />
        </Suspense>
      </main>
    </div>
  );
}
