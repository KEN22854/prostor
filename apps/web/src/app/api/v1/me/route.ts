import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { requireApiUser } from '@/services/api-keys';

/** GET /api/v1/me — владелец ключа (проверка ключа) */
export const GET = withErrorHandling(async (req: Request) => {
  const user = await requireApiUser(req, 'read');
  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
});
