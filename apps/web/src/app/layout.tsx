import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { getLocale } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const en = (await getLocale()) === 'en';
  return {
    title: {
      default: en ? 'Prostor — collaborative whiteboard' : 'Простор — доска для совместной работы',
      template: en ? '%s · Prostor' : '%s · Простор',
    },
    description: en
      ? 'Infinite online whiteboard: stickies, diagrams, mind maps, kanban and docs — with your team in real time.'
      : 'Бесконечная онлайн-доска: стикеры, схемы, mind map, канбан и документы — вместе с командой в реальном времени.',
    applicationName: en ? 'Prostor' : 'Простор',
    // Установленное приложение на iOS: полноэкранный режим и подпись под иконкой
    appleWebApp: { capable: true, title: en ? 'Prostor' : 'Простор', statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9fe' },
    { media: '(prefers-color-scheme: dark)', color: '#140f1d' },
  ],
  // Телефон: без автозума страницы (холст масштабируется жестами сам) и под «чёлкой»
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning: next-themes ставит класс темы до гидрации
    <html lang={locale} suppressHydrationWarning>
      <body className={cn('min-h-full font-sans', inter.variable)}>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
