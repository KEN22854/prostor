'use client';

import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale, useSetLocale } from '@/lib/i18n/client';
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/core';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

/** Переключатель языка интерфейса (Русский / English) */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="group"
      aria-label={t('Language / Язык')}
    >
      <Languages className="size-4 text-muted-foreground" aria-hidden />
      {LOCALES.map((l) => (
        <Button
          key={l}
          type="button"
          size="sm"
          variant={l === locale ? 'secondary' : 'ghost'}
          className="h-7 px-2 text-xs"
          aria-pressed={l === locale}
          onClick={() => l !== locale && setLocale(l)}
        >
          {LOCALE_NAMES[l]}
        </Button>
      ))}
    </div>
  );
}
