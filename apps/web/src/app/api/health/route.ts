import { NextResponse } from 'next/server';
import { prisma } from '@prostor/db';

// Используется healthcheck'ом Docker и балансировщиком: проверяет связь с Postgres.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'ok' });
  } catch (error: unknown) {
    console.error('[health] db check failed', error);
    return NextResponse.json({ status: 'degraded', db: 'error' }, { status: 503 });
  }
}
