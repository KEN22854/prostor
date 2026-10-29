import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { deleteTemplate } from '@/services/templates';

/** DELETE /api/templates/:id — автор или администратор организации */
export const DELETE = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    await deleteTemplate(user, id);
    return NextResponse.json({ ok: true });
  },
);
