import { WifiOff } from 'lucide-react';
import { Aurora } from '@/components/brand/logo';

/** Показывается PWA без сети, если страница ещё не открывалась (остальные — из кэша) */
export default function OfflinePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6 text-center">
      <Aurora />
      <div className="glass shadow-soft-lg relative z-10 max-w-sm animate-fade-up space-y-3 rounded-3xl p-8">
        <span className="bg-brand-gradient shadow-glow mx-auto flex size-14 animate-float items-center justify-center rounded-2xl text-white">
          <WifiOff />
        </span>
        <h1 className="text-xl font-semibold">Нет подключения к интернету</h1>
        <p className="text-sm text-muted-foreground">
          Открытые раньше доски работают офлайн — изменения сохранятся и синхронизируются, когда
          связь вернётся.
        </p>
      </div>
    </main>
  );
}
