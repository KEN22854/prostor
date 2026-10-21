'use client';

import { Settings, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SharingPanel } from '@/components/sharing/sharing-panel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/client';

/** Кнопка «Поделиться» в шапке доски и диалог управления доступом */
export function ShareDialog({ boardId, title }: { boardId: string; title: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Share2 /> {t('Поделиться')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('Поделиться доской')}</DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-2">
            <span className="truncate">«{title}»</span>
            <Link
              href={`/board/${boardId}/settings`}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              <Settings className="size-3.5" /> {t('Настройки доски')}
            </Link>
          </DialogDescription>
        </DialogHeader>
        {/* Данные грузятся только при открытии диалога */}
        <SharingPanel boardId={boardId} enabled={open} />
      </DialogContent>
    </Dialog>
  );
}
