import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { getAiJob } from '@/services/ai';

/** GET /api/ai/jobs/:id — статус и прогресс ИИ-задачи (polling с клиента) */
export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    return NextResponse.json(await getAiJob(user, id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
);
