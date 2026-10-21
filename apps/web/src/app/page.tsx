import Link from 'next/link';
import { LayoutGrid, Users, WifiOff, Sparkles } from 'lucide-react';
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
    text: 'Mind map по теме, стикеры для ретро, удаление фона у картинок.',
  },
] as const;

// Server Component: статичная страница без клиентского JS.
export default async function HomePage() {
  const t = await getT();
  return (
    <main className="flex min-h-screen flex-col">
      <header className="container flex h-16 items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">{t('Простор')}</span>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">{t('Войти')}</Link>
          </Button>
          <Button asChild>
            <Link href="/register">{t('Начать бесплатно')}</Link>
          </Button>
        </nav>
      </header>

      <section className="container flex flex-1 flex-col items-center justify-center gap-6 py-20 text-center">
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          Думайте вместе на&nbsp;бесконечной доске
        </h1>
        <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
          Планируйте, рисуйте схемы и проводите ретро с командой. В облаке или на своём сервере.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/register">{t('Создать доску')}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">{t('У меня есть аккаунт')}</Link>
          </Button>
        </div>
      </section>

      <section className="container grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-lg border bg-card p-5">
            <Icon className="mb-3 size-5 text-primary" aria-hidden />
            <h2 className="mb-1 font-medium">{title}</h2>
            <p className="text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
