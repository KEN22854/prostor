import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { listTemplates } from '@/services/templates';

/** GET /api/templates — свои шаблоны и шаблоны организаций пользователя */
export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return NextResponse.json({ templates: await listTemplates(user) });
});
