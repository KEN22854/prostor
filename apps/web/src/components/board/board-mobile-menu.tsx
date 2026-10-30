'use client';

import { Download, History, Moon, MoreHorizontal, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n/client';
import { useCanvasStore } from '@/stores/canvas-store';

/** Шапка доски на телефоне: редкие действия — в одном меню, чтобы кнопки не теснились */
export function BoardMobileMenu({
  canExport,
  canHistory,
}: {
  canExport: boolean;
  canHistory: boolean;
}) {
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('Ещё')}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canExport ? (
          <DropdownMenuItem onSelect={() => useCanvasStore.getState().setPanel('export')}>
            <Download /> {t('Экспорт')}
          </DropdownMenuItem>
        ) : null}
        {canHistory ? (
          <DropdownMenuItem onSelect={() => useCanvasStore.getState().setPanel('history')}>
            <History /> {t('История версий')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? <Sun /> : <Moon />} {dark ? t('Светлая тема') : t('Тёмная тема')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
