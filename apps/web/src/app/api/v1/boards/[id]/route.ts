import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireApiUser } from '@/services/api-keys';
import { apiGetBoard } from '@/services/api-v1';

/** GET /api/v1/boards/:id — сведения о доске */
export const GET = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireApiUser(req, 'read');
    return NextResponse.json(await apiGetBoard(user, id));
  },
);
