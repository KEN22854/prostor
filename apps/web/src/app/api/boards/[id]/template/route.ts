import { NextResponse } from 'next/server';
import { saveTemplateSchema } from '@prostor/shared';
import { parseJson, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { saveBoardAsTemplate } from '@/services/templates';

/** POST /api/boards/:id/template { title, description, scope } — сохранить доску как шаблон */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    const input = await parseJson(req, saveTemplateSchema);
    return NextResponse.json(await saveBoardAsTemplate(user, id, input), { status: 201 });
  },
);
