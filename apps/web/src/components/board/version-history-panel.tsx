'use client';

import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { History, Loader2, Save, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SNAPSHOT_REASON_LABELS, type BoardVersionDto } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/fetcher';
import { cn, errorMessage } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { usePlural, useT } from '@/lib/i18n/client';

interface VersionHistoryPanelProps {
  boardId: string;
  /** Текущий просматриваемый снимок */
  activeId: string | null;
  onPreview: (version: BoardVersionDto) => void;
  /** Сохранить текущее состояние как версию с подписью */
  onSave: (label: string) => Promise<void>;
  /** Меняется после сохранения/восстановления — повод перечитать список */
  refreshKey: number;
}

function dayLabel(date: Date): string {
  if (isToday(date)) return 'Сегодня';
  if (isYesterday(date)) return 'Вчера';
  return format(date, 'd MMMM yyyy', { locale: ru });
}

/** Боковая панель истории версий: группы по дням, ручное сохранение */
export function VersionHistoryPanel({
  boardId,
  activeId,
  onPreview,
  onSave,
  refreshKey,
}: VersionHistoryPanelProps) {
  const t = useT();
  const tp = usePlural();
  const open = useCanvasStore((s) => s.panel === 'history');
  const setPanel = useCanvasStore((s) => s.setPanel);
  const [versions, setVersions] = useState<BoardVersionDto[] | null>(null);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<{ versions: BoardVersionDto[] }>(
        `/api/boards/${boardId}/versions`,
      );
      setVersions(data.versions);
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось загрузить историю')));
    }
  }, [boardId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load, refreshKey]);

  if (!open) return null;

  async function save() {
    setSaving(true);
    try {
      await onSave(label.trim());
      setLabel('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  const groups = new Map<string, BoardVersionDto[]>();
  for (const v of versions ?? []) {
    const key = dayLabel(new Date(v.createdAt));
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }

  return (
    <aside
      className="absolute bottom-0 right-0 top-0 z-20 flex w-80 max-w-full flex-col border-l bg-background shadow-xl"
      aria-label={t('История версий')}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-medium">
          <History className="size-4" /> {t('История версий')}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('Закрыть историю')}
          onClick={() => setPanel(null)}
        >
          <X />
        </Button>
      </div>

      <form
        className="flex gap-2 border-b p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          aria-label={t('Название версии')}
          placeholder={t('Название версии (необязательно)')}
          value={label}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <Button type="submit" size="icon" aria-label={t('Сохранить версию')} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
        </Button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="version-list">
        {versions === null ? (
          <div className="flex justify-center py-8">
            <Loader2
              className="size-5 animate-spin text-muted-foreground"
              aria-label={t('Загрузка')}
            />
          </div>
        ) : versions.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {t(
              'Версий пока нет. Они создаются автоматически во время работы, или сохраните текущую вручную.',
            )}
          </p>
        ) : (
          Array.from(groups.entries()).map(([day, items]) => (
            <section key={day} className="mb-2">
              <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">{day}</h3>
              <ul>
                {items.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => onPreview(v)}
                      className={cn(
                        'w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted',
                        activeId === v.id && 'bg-accent text-accent-foreground',
                      )}
                      data-testid="version-item"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">
                          {v.label ?? SNAPSHOT_REASON_LABELS[v.reason]}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {format(new Date(v.createdAt), 'HH:mm', { locale: ru })}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {v.label ? `${SNAPSHOT_REASON_LABELS[v.reason]} · ` : ''}
                        {v.objectCount} {tp(v.objectCount, ['объект', 'объекта', 'объектов'])}
                        {v.createdByName
                          ? ` · ${v.createdByName}`
                          : v.authorNames.length
                            ? ` · ${v.authorNames.join(', ')}`
                            : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
