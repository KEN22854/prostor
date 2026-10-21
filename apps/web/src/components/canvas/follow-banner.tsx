'use client';

import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/stores/canvas-store';

/** Рамка цвета ведущего вокруг холста и полоса «Вы следуете за …» */
export function FollowBanner() {
  const follow = useCanvasStore((s) => s.follow);
  const setFollow = useCanvasStore((s) => s.setFollow);
  if (!follow) return null;
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-[16] border-4"
        style={{ borderColor: follow.color }}
        aria-hidden
      />
      <div
        className="absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-1.5 text-sm text-white shadow-lg"
        style={{ backgroundColor: follow.color }}
        role="status"
        data-testid="follow-banner"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Eye className="size-4" aria-hidden />
        {follow.auto ? `${follow.name} показывает доску` : `Вы следуете за ${follow.name}`}
        <Button
          size="sm"
          variant="secondary"
          className="h-7 rounded-full px-3 text-xs"
          onClick={() => setFollow(null)}
        >
          {follow.auto ? 'Смотреть самостоятельно' : 'Перестать'}
        </Button>
      </div>
    </>
  );
}
