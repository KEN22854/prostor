import { NextResponse } from 'next/server';
import { toolbarSettingsSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { setPinnedTools } from '@/services/profile';

/** PUT /api/account/toolbar — какие инструменты всегда видны на панели доски */
export const PUT = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const { pinned } = await parseJson(req, toolbarSettingsSchema);
  await setPinnedTools(user, pinned);
  return NextResponse.json({ ok: true });
});
