import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, LayoutGrid, MousePointer2, Sparkles, Users, WifiOff } from 'lucide-react';
import { Aurora, Logo } from '@/components/brand/logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Reveal } from '@/components/reveal';
import { Button } from '@/components/ui/button';
import { getT } from '@/lib/i18n/server';

const features = [
  {
    icon: LayoutGrid,
    title: 'Бесконечный холст',
    text: 'Стикеры, фигуры, mind map, канбан и документы на одной доске.',
  },
  {
    icon: Users,
    title: 'Вместе в реальном времени',
    text: 'Курсоры коллег, follow-mode и презентации по фреймам.',
  },
  {
    icon: WifiOff,
    title: 'Работает офлайн',
    text: 'Изменения сохраняются локально и синхронизируются без конфликтов.',
  },
  {
    icon: Sparkles,
    title: 'ИИ-помощник',
    text: 'Генерация картинок, удаление фона и подсказки прямо на доске.',
  },
] as const;

const order = (i: number) => ({ '--i': i }) as CSSProperties;

// Server Component: статичная страница, анимации — чистый CSS.
export default async function HomePage() {
  const t = await getT();
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <Aurora />

      <header className="container relative z-10 flex h-20 items-center justify-between">
        <Logo label={t('Простор')} />
        <nav className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:flex" />
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">{t('Войти')}</Link>
          </Button>
          <Button asChild variant="gradient">
            <Link href="/register">{t('Начать бесплатно')}</Link>
          </Button>
        </nav>
      </header>

      <section className="container relative z-10 flex flex-col items-center gap-7 pb-16 pt-14 text-center sm:pt-20">
        <span
          className="stagger shadow-soft inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur"
          style={order(0)}
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {t('Онлайн-доска для команд')}
        </span>
        <h1
          className="stagger max-w-4xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl"
          style={order(1)}
        >
          {t('Думайте вместе на')} <span className="text-gradient">{t('бесконечной доске')}</span>
        </h1>
        <p
          className="stagger max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl"
          style={order(2)}
        >
          {t(
            'Планируйте, рисуйте схемы и проводите ретро с командой. В облаке или на своём сервере.',
          )}
        </p>
        <div className="stagger flex flex-col gap-3 sm:flex-row" style={order(3)}>
          <Button asChild size="lg" variant="gradient" className="group">
            <Link href="/register">
              {t('Создать доску')}
              <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">{t('У меня есть аккаунт')}</Link>
          </Button>
        </div>

        <BoardPreview t={t} />
      </section>

      <section className="container relative z-10 grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, text }, i) => (
          <Reveal key={title} delay={i * 90}>
            <div className="lift group/card shadow-soft h-full rounded-2xl border bg-card/80 p-6 backdrop-blur">
              <span className="group-hover/card:bg-brand-gradient group-hover/card:shadow-glow mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-accent text-primary transition-all duration-500 ease-smooth group-hover/card:-rotate-6 group-hover/card:scale-110 group-hover/card:text-white">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="mb-1.5 font-semibold">{t(title)}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(text)}</p>
            </div>
          </Reveal>
        ))}
      </section>
    </main>
  );
}

/** Иллюстрация доски: окно с плавающими стикерами, стрелкой и курсорами коллег */
function BoardPreview({ t }: { t: (key: string) => string }) {
  const sticky =
    'absolute flex animate-float items-center justify-center rounded-xl p-3 text-left text-sm font-medium text-slate-800 shadow-soft';
  return (
    <div className="stagger relative mt-10 w-full max-w-5xl" style={order(4)}>
      <div className="bg-brand-gradient absolute -inset-4 rounded-[2rem] opacity-25 blur-3xl" />
      <div className="shadow-soft-lg relative overflow-hidden rounded-3xl border border-white/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-card/80">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="size-3 rounded-full bg-[#fda4af]" />
          <span className="size-3 rounded-full bg-[#fcd34d]" />
          <span className="size-3 rounded-full bg-[#86efac]" />
          <span className="ml-3 text-xs text-muted-foreground">{t('Ретро спринта')}</span>
        </div>
        <div
          className="relative h-[300px] bg-canvas sm:h-[400px]"
          style={{
            backgroundImage: 'radial-gradient(hsl(var(--canvas-grid)) 1.2px, transparent 1.2px)',
            backgroundSize: '22px 22px',
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 1000 400"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d="M292 105 C 360 105, 395 130, 395 182"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="6 8"
              className="animate-[dash_2.5s_linear_infinite]"
            />
          </svg>

          <div
            className={`${sticky} left-[6%] top-[12%] h-28 w-36 bg-[#fef08a] sm:h-32 sm:w-44`}
            style={{ '--r': '-3deg', animationDelay: '0s' } as CSSProperties}
          >
            {t('Что прошло хорошо?')}
          </div>
          <div
            className={`${sticky} left-[30%] top-[46%] h-28 w-36 bg-[#e9d5ff] sm:h-32 sm:w-44`}
            style={{ '--r': '2deg', animationDelay: '-2s' } as CSSProperties}
          >
            {t('Идеи на следующий спринт')}
          </div>
          <div
            className={`${sticky} right-[24%] top-[10%] h-28 w-36 bg-[#fbcfe8] sm:h-32 sm:w-44`}
            style={{ '--r': '3deg', animationDelay: '-4s' } as CSSProperties}
          >
            {t('Что улучшить?')}
          </div>
          <div
            className={`${sticky} bottom-[10%] right-[5%] hidden h-28 w-40 bg-[#bae6fd] sm:flex`}
            style={{ '--r': '-2deg', animationDelay: '-3s' } as CSSProperties}
          >
            {t('Голосуем за лучшие идеи')}
          </div>

          <PreviewCursor name="Алиса" color="#a855f7" className="left-[46%] top-[28%]" delay="0s" />
          <PreviewCursor
            name="Максим"
            color="#ec4899"
            className="left-[66%] top-[62%]"
            delay="-3s"
          />
        </div>
      </div>
    </div>
  );
}

function PreviewCursor({
  name,
  color,
  className,
  delay,
}: {
  name: string;
  color: string;
  className: string;
  delay: string;
}) {
  return (
    <div
      className={`absolute animate-[cursor-wander_9s_ease-in-out_infinite] ${className}`}
      style={{ animationDelay: delay }}
    >
      <MousePointer2 className="size-5 drop-shadow" style={{ color, fill: color }} />
      <span
        className="ml-4 mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white shadow"
        style={{ background: color }}
      >
        {name}
      </span>
    </div>
  );
}
