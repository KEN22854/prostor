import 'server-only';
import { NextResponse } from 'next/server';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Единый формат ошибок REST API:
 *   { error: { code, message, fields? } }
 * Клиент (lib/fetcher) показывает message в toast, а fields — у полей формы.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export async function parseJson<T>(
  req: Request,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'Некорректное тело запроса');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new ApiError(422, 'validation_error', 'Проверьте правильность заполнения полей', fields);
  }
  return parsed.data;
}

/** Обёртка роута: ApiError → JSON с нужным статусом, прочее → 500 без деталей */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        return NextResponse.json<ApiErrorBody>(
          { error: { code: error.code, message: error.message, fields: error.fields } },
          { status: error.status, headers: error.headers },
        );
      }
      console.error('[api] unhandled error', error);
      return NextResponse.json<ApiErrorBody>(
        { error: { code: 'internal_error', message: 'Внутренняя ошибка сервера' } },
        { status: 500 },
      );
    }
  };
}
