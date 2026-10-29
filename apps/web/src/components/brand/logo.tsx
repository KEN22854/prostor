import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Знак «Простора»: сиреневый градиентный квадрат с тремя «стикерами» */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'bg-brand-gradient shadow-glow relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px]',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none">
        <rect x="3" y="3" width="8" height="8" rx="2.2" fill="white" />
        <rect x="13" y="3" width="8" height="8" rx="2.2" fill="white" fillOpacity="0.65" />
        <rect x="3" y="13" width="8" height="8" rx="2.2" fill="white" fillOpacity="0.65" />
        <path
          d="M14 17.2c1.6-2.6 4.4-2.6 6 0"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Логотип со словом — ссылка на главную или дашборд */
export function Logo({
  href = '/',
  label,
  className,
}: {
  href?: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight',
        className,
      )}
    >
      <LogoMark className="transition-transform duration-500 ease-smooth group-hover:rotate-[8deg] group-hover:scale-110" />
      <span>{label}</span>
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
