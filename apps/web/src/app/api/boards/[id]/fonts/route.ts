import { NextResponse } from 'next/server';
import { ApiError, withErrorHandling } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { uploadBoardFont } from '@/services/fonts';

/** POST /api/boards/:id/fonts — свой шрифт (multipart: file, family) */
export const POST = withErrorHandling(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await requireUser();
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, 'invalid_form', 'Ожидается multipart/form-data');
    }
    return NextResponse.json(await uploadBoardFont(user, id, form), { status: 201 });
  },
);
