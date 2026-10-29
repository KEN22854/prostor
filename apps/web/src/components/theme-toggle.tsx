'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

type ThemeName = 'light' | 'dark' | 'system';

/** Тема с плавным «раскрытием» кругом от точки клика (View Transitions API) */
function useAnimatedTheme() {
  const { setTheme, resolvedTheme } = useTheme();
  return (next: ThemeName, origin?: { x: number; y: number }) => {
    const apply = () => {
      flushSync(() => setTheme(next));
      // next-themes ставит класс в эффекте — для снимка перехода нужен сразу
      const dark =
        next === 'dark' ||
        (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.classList.toggle('light', !dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduced || !resolvedTheme) {
      apply();
      return;
    }
    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? 0;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const transition = document.startViewTransition(apply);
    void transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 550,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    });
  };
}

/** Тема известна только на клиенте — до гидрации рисуем нейтральную кнопку */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

const center = (e: MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Кнопка «солнце / луна» для шапок */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const switchTheme = useAnimatedTheme();
  const dark = mounted && resolvedTheme === 'dark';
  const label = dark ? t('Светлая тема') : t('Тёмная тема');
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('relative overflow-hidden rounded-full', className)}
      aria-label={label}
      title={label}
      onClick={(e) => switchTheme(dark ? 'light' : 'dark', center(e))}
    >
      <Sun
        className={cn(
          'absolute transition-all duration-500 ease-smooth',
          dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
        )}
      />
      <Moon
        className={cn(
          'absolute transition-all duration-500 ease-smooth',
          dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
        )}
      />
    </Button>
  );
}

/** Выбор темы в настройках: светлая, тёмная или как в системе */
export function ThemePicker() {
  const t = useT();
  const mounted = useMounted();
  const { theme } = useTheme();
  const switchTheme = useAnimatedTheme();
  const options: Array<{ value: ThemeName; label: string; icon: typeof Sun }> = [
    { value: 'light', label: t('Светлая'), icon: Sun },
    { value: 'dark', label: t('Тёмная'), icon: Moon },
    { value: 'system', label: t('Как в системе'), icon: Monitor },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Тема оформления')}>
      {options.map(({ value, label, icon: Icon }) => {
        const active = mounted && (theme ?? 'light') === value;
        return (
          <Button
            key={value}
            type="button"
            variant="outline"
            role="radio"
            aria-checked={active}
            className={cn(active && 'border-primary bg-accent text-primary')}
            onClick={(e) => switchTheme(value, center(e))}
          >
            <Icon /> {label}
          </Button>
        );
      })}
    </div>
  );
}
