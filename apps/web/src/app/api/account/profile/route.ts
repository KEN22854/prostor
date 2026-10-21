import { NextResponse } from 'next/server';
import { updateProfileSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { updateProfile } from '@/services/profile';

/** PATCH /api/account/profile — имя пользователя */
export const PATCH = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  await updateProfile(user, await parseJson(req, updateProfileSchema));
  return NextResponse.json({ ok: true });
});
