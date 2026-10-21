import { NextResponse } from 'next/server';
import { createApiKeySchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { createApiKey, listApiKeys } from '@/services/api-keys';

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  return NextResponse.json({ keys: await listApiKeys(user) });
});

/** Новый ключ — в ответе один раз */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, createApiKeySchema);
  return NextResponse.json(await createApiKey(user, input), { status: 201 });
});
