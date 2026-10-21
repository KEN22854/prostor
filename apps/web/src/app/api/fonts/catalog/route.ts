import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { fontCatalog } from '@/lib/fonts/google';

/** GET /api/fonts/catalog — все шрифты Google Fonts (кэш сутки) */
export const GET = withErrorHandling(async () => {
  const fonts = await fontCatalog();
  return NextResponse.json({ fonts }, { headers: { 'cache-control': 'public, max-age=3600' } });
});
