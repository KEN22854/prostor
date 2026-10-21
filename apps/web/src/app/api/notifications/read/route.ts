import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { markRead, markThreadRead } from '@/services/notifications';

const schema = z.object({
  /** Не указаны ни ids, ни threadId — прочитать все */
  ids: z.array(z.string().max(64)).max(200).optional(),
  threadId: z.string().max(64).optional(),
});

/** POST /api/notifications/read */
export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const input = await parseJson(req, schema);
  if (input.threadId) await markThreadRead(user.id, input.threadId);
  else await markRead(user.id, input.ids ?? null);
  return NextResponse.json({ ok: true });
});
