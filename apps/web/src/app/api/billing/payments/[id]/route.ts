import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { paymentStatus } from '@/services/billing';

/** GET /api/billing/payments/:id — статус своего платежа */
export const GET = withErrorHandling(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    return NextResponse.json(await paymentStatus(user, id));
  },
);
