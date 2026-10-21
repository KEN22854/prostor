import 'server-only';
import { NextResponse } from 'next/server';
import type { AuditEntryDto } from '@prostor/shared';
import { auditToCsv, type AuditQuery } from '@/services/audit-log';

/** Параметры журнала из URL: ?before=&action=&actor=&format=csv */
export function auditQuery(req: Request): { query: AuditQuery; csv: boolean } {
  const params = new URL(req.url).searchParams;
  return {
    query: {
      before: params.get('before') ?? undefined,
      action: params.get('action') ?? undefined,
      actorId: params.get('actor') ?? undefined,
    },
    csv: params.get('format') === 'csv',
  };
}

export function auditResponse(entries: AuditEntryDto[], csv: boolean, fileName: string): Response {
  if (csv) {
    return new NextResponse(auditToCsv(entries), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const last = entries[entries.length - 1];
  return NextResponse.json(
    { entries, next: entries.length >= 50 && last ? `${last.createdAt}|${last.id}` : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
