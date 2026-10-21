'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';

/**
 * «Простор» не регистрирует service worker. Если в браузере остался чужой
 * (от другого приложения, работавшего на этом же адресе), он подменяет наши
 * файлы закэшированными — снимаем такие регистрации и чистим их кэши.
 */
function useRemoveForeignServiceWorkers() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      if (registrations.length === 0) return;
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      // Страница могла быть отдана чужим воркером — загружаем её заново уже без него
      if (navigator.serviceWorker.controller) window.location.reload();
    });
  }, []);
}

/** Клиентские провайдеры верхнего уровня */
export function Providers({ children }: { children: ReactNode }) {
  useRemoveForeignServiceWorkers();
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
