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

/** Кнопка «Поделиться» в шапке доски и диалог управления доступом */
export function ShareDialog({ boardId, title }: { boardId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Share2 /> Поделиться
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Поделиться доской</DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-2">
            <span className="truncate">«{title}»</span>
            <Link
              href={`/board/${boardId}/settings`}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              <Settings className="size-3.5" /> Настройки доски
            </Link>
          </DialogDescription>
        </DialogHeader>
        {/* Данные грузятся только при открытии диалога */}
        <SharingPanel boardId={boardId} enabled={open} />
      </DialogContent>
    </Dialog>
  );
}
