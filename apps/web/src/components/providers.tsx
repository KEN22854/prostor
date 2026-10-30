'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { I18nProvider } from '@/lib/i18n/client';
import type { Locale } from '@/lib/i18n/core';

const OWN_WORKER = '/prostor-sw.js';

/**
 * PWA: регистрируем свой service worker (офлайн-оболочка, кэш статики и картинок).
 * В разработке — только с NEXT_PUBLIC_PWA_DEV=1: кэш мешал бы горячей перезагрузке.
 *
 * Чужие воркеры (от другого приложения, работавшего на этом же адресе) снимаем
 * и чистим их кэши — иначе они подменяли бы наши файлы закэшированными.
 */
function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      let removed = false;
      for (const registration of registrations) {
        const script = registration.active?.scriptURL ?? registration.installing?.scriptURL ?? '';
        if (new URL(script || location.href).pathname === OWN_WORKER) continue;
        await registration.unregister();
        removed = true;
      }
      if (removed && 'caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => !k.startsWith('prostor-')).map((k) => caches.delete(k)),
        );
      }
      const enabled =
        process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_PWA_DEV === '1';
      if (enabled) await navigator.serviceWorker.register(OWN_WORKER, { scope: '/' });
      // Страница могла быть отдана чужим воркером — загружаем её заново уже без него
      else if (removed && navigator.serviceWorker.controller) window.location.reload();
    })().catch(() => undefined);
  }, []);
}

/** Клиентские провайдеры верхнего уровня */
export function Providers({ children, locale }: { children: ReactNode; locale: Locale }) {
  useServiceWorker();
  return (
    // refetchOnWindowFocus=false: сессия проверяется на сервере, лишние
    // запросы /api/auth/session при переключении вкладок не нужны
    <I18nProvider locale={locale}>
      <SessionProvider refetchOnWindowFocus={false}>
        {/* Основная тема — светлая; тёмную или «как в системе» выбирают сами */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </SessionProvider>
    </I18nProvider>
  );
}
