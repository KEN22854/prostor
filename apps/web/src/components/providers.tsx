'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';

/** Клиентские провайдеры верхнего уровня */
export function Providers({ children }: { children: ReactNode }) {
  return (
    // refetchOnWindowFocus=false: сессия проверяется на сервере, лишние
    // запросы /api/auth/session при переключении вкладок не нужны
    <SessionProvider refetchOnWindowFocus={false}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        <Toaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
