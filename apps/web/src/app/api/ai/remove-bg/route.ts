import { NextResponse } from 'next/server';
import { removeBgRequestSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { createRemoveBgJob } from '@/services/ai';

/**
 * POST /api/ai/remove-bg — поставить в очередь удаление фона.
 * Ответ 202 с задачей; результат — через GET /api/ai/jobs/:id.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, removeBgRequestSchema);
  return NextResponse.json(await createRemoveBgJob(user, input), { status: 202 });
});
