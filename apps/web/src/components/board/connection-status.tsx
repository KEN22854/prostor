'use client';

import { CloudOff, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ConnectionStatus } from '@/lib/yjs/board-connection';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

interface ConnectionStatusProps {
  status: ConnectionStatus;
  hasPendingChanges: boolean;
  localReady: boolean;
}

const VIEW: Record<ConnectionStatus, { label: string; hint: string; className: string }> = {
  offline: {
    label: 'Офлайн',
    hint: 'Нет соединения. Изменения сохраняются на этом устройстве и отправятся автоматически.',
    className: 'text-amber-600 dark:text-amber-400',
  },
  connecting: {
    label: 'Подключение…',
    hint: 'Устанавливаем соединение с сервером.',
    className: 'text-muted-foreground',
  },
  syncing: {
    label: 'Синхронизация…',
    hint: 'Обмениваемся изменениями с сервером.',
    className: 'text-muted-foreground',
  },
  synced: {
    label: 'Сохранено',
    hint: 'Все изменения синхронизированы.',
    className: 'text-emerald-600 dark:text-emerald-400',
  },
};

function StatusIcon({ status }: { status: ConnectionStatus }) {
  switch (status) {
    case 'offline':
      return <CloudOff className="size-4" aria-hidden />;
    case 'connecting':
      return <Loader2 className="size-4 animate-spin" aria-hidden />;
    case 'syncing':
      return <RefreshCw className="size-4 animate-spin" aria-hidden />;
    case 'synced':
      return <CheckCircle2 className="size-4" aria-hidden />;
  }
}

/** Индикатор online / offline / syncing / synced в шапке доски */
export function ConnectionStatusIndicator({
  status,
  hasPendingChanges,
  localReady,
}: ConnectionStatusProps) {
  const t = useT();
  const view = VIEW[status];
  const pending = status === 'offline' && hasPendingChanges;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="status"
          aria-live="polite"
          data-status={status}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
            view.className,
          )}
        >
          <StatusIcon status={status} />
          <span>{pending ? t('Офлайн · есть несохранённое') : t(view.label)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {view.hint}
        {!localReady ? t(' Загружаем локальную копию…') : null}
      </TooltipContent>
    </Tooltip>
  );
}
