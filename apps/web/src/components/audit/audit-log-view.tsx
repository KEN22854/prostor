'use client';

import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Download, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, type AuditEntryDto } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { apiRequest } from '@/lib/fetcher';
import { useT } from '@/lib/i18n/client';

/** Краткая расшифровка metadata для таблицы */
function details(e: AuditEntryDto): string {
  const m = e.metadata;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    parts.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(', ').slice(0, 160);
}

/** Журнал аудита: фильтр по действию, подгрузка страниц, выгрузка CSV */
export function AuditLogView({ endpoint }: { endpoint: string }) {
  const t = useT();
  const [entries, setEntries] = useState<AuditEntryDto[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const query = (extra: Record<string, string>) => {
    const params = new URLSearchParams({ ...(action ? { action } : {}), ...extra });
    const s = params.toString();
    return s ? `${endpoint}?${s}` : endpoint;
  };

  const load = useCallback(async () => {
    setEntries(null);
    const params = new URLSearchParams(action ? { action } : {});
    const data = await apiRequest<{ entries: AuditEntryDto[]; next: string | null }>(
      params.toString() ? `${endpoint}?${params}` : endpoint,
    ).catch(() => ({ entries: [], next: null }));
    setEntries(data.entries);
    setNext(data.next);
  }, [endpoint, action]);

  useEffect(() => {
    void load();
  }, [load]);

  async function more() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const data = await apiRequest<{ entries: AuditEntryDto[]; next: string | null }>(
        query({ before: next }),
      );
      setEntries((prev) => [...(prev ?? []), ...data.entries]);
      setNext(data.next);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-64">
          <NativeSelect
            aria-label={t('Действие')}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">{t('Все действия')}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <a href={query({ format: 'csv' })} download>
            <Download /> CSV
          </a>
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" data-testid="audit-table">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t('Когда')}</th>
              <th className="px-3 py-2 font-medium">{t('Действие')}</th>
              <th className="px-3 py-2 font-medium">{t('Кто')}</th>
              <th className="px-3 py-2 font-medium">{t('Доска')}</th>
              <th className="px-3 py-2 font-medium">{t('Подробности')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries === null ? (
              <tr>
                <td colSpan={5} className="p-6 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {t('Записей нет')}
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {format(new Date(e.createdAt), 'd MMM yyyy, HH:mm:ss', { locale: ru })}
                  </td>
                  <td className="px-3 py-2">{e.actionLabel}</td>
                  <td className="px-3 py-2">{e.actorName ?? e.actorEmail ?? '—'}</td>
                  <td className="max-w-40 truncate px-3 py-2">{e.boardTitle ?? '—'}</td>
                  <td
                    className="max-w-xs truncate px-3 py-2 text-xs text-muted-foreground"
                    title={details(e)}
                  >
                    {details(e) || '—'}
                    {e.ip ? ` · ${e.ip}` : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {next ? (
        <Button variant="outline" size="sm" onClick={() => void more()} disabled={loadingMore}>
          {loadingMore ? <Loader2 className="animate-spin" /> : null}
          {t('Показать ещё')}
        </Button>
      ) : null}
    </div>
  );
}
