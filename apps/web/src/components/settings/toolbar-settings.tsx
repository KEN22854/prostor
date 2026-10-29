'use client';

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DEFAULT_PINNED_TOOLS, TOOLBAR_TOOL_IDS, type ToolbarToolId } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { TOOLBAR_META } from '@/lib/canvas/toolbar-meta';
import { apiRequest } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';
import { cn, errorMessage } from '@/lib/utils';

/**
 * Какие инструменты всегда видны на панели доски. Клик по инструменту
 * переносит его между панелью и меню «…»; сохраняется сразу.
 */
export function ToolbarSettings({ initial }: { initial: ToolbarToolId[] }) {
  const t = useT();
  const [pinned, setPinned] = useState<ToolbarToolId[]>(initial);

  async function save(next: ToolbarToolId[]) {
    const prev = pinned;
    setPinned(next);
    try {
      await apiRequest('/api/account/toolbar', { method: 'PUT', body: { pinned: next } });
    } catch (e: unknown) {
      setPinned(prev);
      toast.error(errorMessage(e, t('Не удалось сохранить настройку')));
    }
  }

  function toggle(id: ToolbarToolId) {
    if (pinned.includes(id)) {
      if (pinned.length === 1) {
        toast.error(t('На панели должен остаться хотя бы один инструмент'));
        return;
      }
      void save(pinned.filter((p) => p !== id));
    } else {
      // Порядок на панели — канонический, как в списке инструментов
      void save(TOOLBAR_TOOL_IDS.filter((x) => x === id || pinned.includes(x)));
    }
  }

  const isDefault =
    pinned.length === DEFAULT_PINNED_TOOLS.length &&
    DEFAULT_PINNED_TOOLS.every((id) => pinned.includes(id));

  const chip = (id: ToolbarToolId) => {
    const { icon: Icon, label } = TOOLBAR_META[id];
    const on = pinned.includes(id);
    return (
      <button
        key={id}
        type="button"
        onClick={() => toggle(id)}
        aria-pressed={on}
        className={cn(
          'hover:shadow-soft flex animate-pop items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-200 hover:-translate-y-px',
          on
            ? 'border-primary/40 bg-accent text-accent-foreground'
            : 'bg-background text-muted-foreground hover:text-foreground',
        )}
      >
        <Icon className="size-4" aria-hidden />
        {t(label)}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('На панели')}</p>
        <div className="flex flex-wrap gap-2">{pinned.map(chip)}</div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('В меню «…»')}</p>
        <div className="flex flex-wrap gap-2">
          {TOOLBAR_TOOL_IDS.filter((id) => !pinned.includes(id)).map(chip)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t('Нажмите на инструмент, чтобы перенести его на панель или в меню')}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={isDefault}
          onClick={() => void save([...DEFAULT_PINNED_TOOLS])}
        >
          <RotateCcw /> {t('По умолчанию')}
        </Button>
      </div>
    </div>
  );
}
