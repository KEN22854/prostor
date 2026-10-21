/**
 * Клиентский помощник для REST API: разбирает единый формат ошибок
 * ({ error: { code, message, fields } }) и бросает ApiClientError.
 */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

interface ErrorShape {
  error?: { code?: unknown; message?: unknown; fields?: unknown };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(
  url: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiClientError(0, 'network_error', 'Нет соединения с сервером');
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ErrorShape | null)?.error;
    throw new ApiClientError(
      res.status,
      typeof err?.code === 'string' ? err.code : 'unknown_error',
      typeof err?.message === 'string' ? err.message : `Ошибка ${res.status}`,
      isStringRecord(err?.fields) ? err.fields : {},
    );
  }
  return data as T;
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiRequest<T>(url, { method: 'POST', body });
}
