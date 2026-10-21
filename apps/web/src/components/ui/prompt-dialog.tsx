'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';

interface PromptOptions {
  title: string;
  description?: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  maxLength?: number;
}

/**
 * Диалог ввода одной строки вместо window.prompt: оформлен как остальной
 * интерфейс, доступен с клавиатуры и не блокирует страницу.
 * const [dialog, ask] = usePrompt(); const name = await ask({ … });
 */
export function usePrompt(): [ReactNode, (options: PromptOptions) => Promise<string | null>] {
  const t = useT();
  const [options, setOptions] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((value: string | null) => void) | null>(null);

  const ask = useCallback((next: PromptOptions) => {
    resolver.current?.(null);
    setValue(next.initial ?? '');
    setOptions(next);
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: string | null) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  };

  const dialog = (
    <Dialog open={options !== null} onOpenChange={(open) => !open && close(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
          {options?.description ? (
            <DialogDescription>{options.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = value.trim();
            if (trimmed) close(trimmed);
          }}
        >
          <Input
            autoFocus
            aria-label={options?.label}
            placeholder={options?.label}
            value={value}
            maxLength={options?.maxLength ?? 100}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(null)}>
              {t('Отмена')}
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              {options?.confirmLabel ?? t('Сохранить')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
  return [dialog, ask];
}
