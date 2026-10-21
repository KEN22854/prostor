import { NextResponse } from 'next/server';
import { visibilitySchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { setVisibility } from '@/services/members';

/** PATCH /api/boards/:id/visibility — приватная / организация / публичная (только чтение) */
export const PATCH = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const { visibility } = await parseJson(req, visibilitySchema);
    await setVisibility(user, id, visibility);
    return NextResponse.json({ ok: true });
  },
);
