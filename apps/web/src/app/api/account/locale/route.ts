import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@prostor/db';
import { parseJson, withErrorHandling } from '@/lib/api';
import { LOCALES } from '@/lib/i18n/core';
import { getSessionUser } from '@/lib/session';

/** PATCH /api/account/locale { locale } — язык в профиле (для вошедших; cookie ставит клиент) */
export const PATCH = withErrorHandling(async (req: Request) => {
  const { locale } = await parseJson(req, z.object({ locale: z.enum(LOCALES) }));
  const user = await getSessionUser();
  if (user) await prisma.user.update({ where: { id: user.id }, data: { locale } });
  return new NextResponse(null, { status: 204 });
});
