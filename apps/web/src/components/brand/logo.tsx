import Image from 'next/image';
import Link from 'next/link';
import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Сиреневая искра логотипа — четырёхлучевая звезда с вогнутыми сторонами */
const sparkle = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;

/** Знак «Простора» — буква «о» из логотипа: круг со стрелкой-курсором и искрой */
export function LogoMark({ className }: { className?: string }) {
  const mask = useId();
  return (
    <span className={cn('relative inline-flex size-8 shrink-0', className)} aria-hidden>
      <svg viewBox="0 0 32 32" className="size-full">
        <mask id={mask}>
          <rect width="32" height="32" fill="white" />
          <path
            d="M18.07 12.44L8.1 17.09L12.34 18.83L13.58 23.15Z"
            fill="black"
            stroke="black"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </mask>
        <circle cx="14" cy="18" r="13" fill="none" stroke="#a98fe3" strokeWidth="1.6" />
        <circle cx="14" cy="18" r="10.8" className="fill-foreground" mask={`url(#${mask})`} />
        <path d={sparkle(27.5, 4.5, 4.5)} fill="#a98fe3" />
      </svg>
    </span>
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
