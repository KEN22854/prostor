import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-2xl font-semibold">Страница не найдена</h1>
      <p className="text-muted-foreground">Возможно, доска удалена или у вас нет к ней доступа.</p>
      <Button asChild>
        <Link href="/">На главную</Link>
      </Button>
    </main>
  );
}
