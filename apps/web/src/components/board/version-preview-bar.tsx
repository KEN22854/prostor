'use client';

import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Eye, Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { SNAPSHOT_REASON_LABELS, type BoardVersionDto } from '@prostor/shared';
import { Button } from '@/components/ui/button';

interface VersionPreviewBarProps {
  version: BoardVersionDto;
  canRestore: boolean;
  onRestore: () => Promise<void>;
  onClose: () => void;
}

/** Полоса над холстом в режиме просмотра версии */
export function VersionPreviewBar({
  version,
  canRestore,
  onRestore,
  onClose,
}: VersionPreviewBarProps) {
  const [pending, setPending] = useState(false);
  return (
    <div
      className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-background/95 px-4 py-2 shadow-lg backdrop-blur"
      role="status"
      aria-label="Просмотр версии"
      data-testid="version-preview-bar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Eye className="size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium">
          Версия от {format(new Date(version.createdAt), 'd MMMM, HH:mm', { locale: ru })}
          {version.label ? ` — ${version.label}` : ` · ${SNAPSHOT_REASON_LABELS[version.reason]}`}
        </p>
        <p className="text-xs text-muted-foreground">
          Только просмотр. Выделите объекты и нажмите Ctrl+C, чтобы перенести их в текущую доску.
        </p>
      </div>
      {canRestore ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await onRestore();
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Восстановить
        </Button>
      ) : null}
      <Button size="sm" variant="outline" onClick={onClose} disabled={pending}>
        К текущей доске
      </Button>
    </div>
  );
}
