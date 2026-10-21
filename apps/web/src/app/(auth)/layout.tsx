import Link from 'next/link';
import type { ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { getT } from '@/lib/i18n/server';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="container flex h-16 items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {t('Простор')}
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        {children}
      </main>
    </div>
  );
}
