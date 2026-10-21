import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireApiUser } from '@/services/api-keys';
import { apiCreateElements, apiListElements } from '@/services/api-v1';

/** GET /api/v1/boards/:id/elements?type=sticky — объекты доски (состояние на ~2 с назад) */
export const GET = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireApiUser(req, 'read');
    const type = new URL(req.url).searchParams.get('type');
    return NextResponse.json({ elements: await apiListElements(user, id, type) });
  },
);

/** POST /api/v1/boards/:id/elements { elements: [{ type, text, x?, y?, color? }] } */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireApiUser(req, 'write');
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    return NextResponse.json(
      { elements: await apiCreateElements(user, id, body) },
      { status: 201 },
    );
  },
);
