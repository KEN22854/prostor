import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Знак «Простора» — иконка приложения: буква P со стрелкой-курсором, орбитой и искрой */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/icon.svg"
      alt=""
      width={32}
      height={32}
      unoptimized
      aria-hidden
      className={cn('size-8 shrink-0', className)}
    />
  );
}

/** Логотип-надпись Prostor — ссылка на главную или дашборд; своя версия для тёмной темы */
export function Logo({
  href = '/',
  label,
  className,
}: {
  href?: string;
  label: string;
  className?: string;
}) {
  const img = 'h-12 w-auto transition-transform duration-500 ease-smooth group-hover:scale-105';
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn('group inline-flex items-center', className)}
    >
      <Image
        src="/brand/logo.png"
        alt={label}
        width={485}
        height={240}
        priority
        className={cn(img, 'dark:hidden')}
      />
      <Image
        src="/brand/logo-dark.png"
        alt={label}
        width={485}
        height={240}
        priority
        className={cn(img, 'hidden dark:block')}
      />
    </Link>
  );
}

/** Плавающие размытые сиреневые пятна на фоне (главная, вход) */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <span className="-left-24 -top-32 size-[28rem] bg-[hsl(var(--primary)/0.55)]" />
      <span
        className="-right-20 top-10 size-[24rem] bg-[hsl(var(--brand-pink)/0.5)]"
        style={{ animationDelay: '-6s' }}
      />
      <span
        className="bottom-[-10rem] left-1/3 size-[30rem] bg-[hsl(var(--brand-sky)/0.45)]"
        style={{ animationDelay: '-12s' }}
      />
    </div>
  );
}
