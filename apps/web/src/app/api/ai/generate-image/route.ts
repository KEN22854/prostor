import { NextResponse } from 'next/server';
import { generateImageRequestSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { createGenerateImageJob } from '@/services/ai';

/**
 * POST /api/ai/generate-image — поставить в очередь генерацию по промпту.
 * Ответ 202 с задачей; результат — через GET /api/ai/jobs/:id.
 */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, generateImageRequestSchema);
  return NextResponse.json(await createGenerateImageJob(user, input), { status: 202 });
});
