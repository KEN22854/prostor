import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { cn } from '@/lib/utils';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Простор — доска для совместной работы',
    template: '%s · Простор',
  },
  description:
    'Бесконечная онлайн-доска: стикеры, схемы, mind map, канбан и документы — вместе с командой в реальном времени.',
  applicationName: 'Простор',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#12141c' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning: next-themes ставит класс темы до гидрации
    <html lang="ru" suppressHydrationWarning>
      <body className={cn('min-h-full font-sans', inter.variable)}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
