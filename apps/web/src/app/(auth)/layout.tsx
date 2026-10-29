import type { ReactNode } from 'react';
import { Aurora, Logo } from '@/components/brand/logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { getT } from '@/lib/i18n/server';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <Aurora />
      <header className="container relative z-10 flex h-20 items-center justify-between">
        <Logo label={t('Простор')} />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        {children}
      </main>
    </div>
  );
}
