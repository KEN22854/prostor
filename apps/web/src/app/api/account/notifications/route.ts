import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { setEmailNotifications } from '@/services/profile';

const schema = z.object({ emailNotifications: z.boolean() });

/** PATCH /api/account/notifications — письма об упоминаниях и ответах */
export const PATCH = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const { emailNotifications } = await parseJson(req, schema);
  await setEmailNotifications(user, emailNotifications);
  return NextResponse.json({ ok: true });
});
