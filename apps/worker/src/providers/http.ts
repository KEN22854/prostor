/** Ошибка провайдера, которую бессмысленно повторять (отказ модели, неверный ввод) */
export class PermanentProviderError extends Error {}

/** Максимальный размер ответа провайдера — защита от «бомб» и ошибок конфигурации */
export const MAX_RESULT_BYTES = 40 * 1024 * 1024;

/**
 * Скачивание результата по URL с таймаутом и лимитом размера.
 * Читаем потоком и обрываем на превышении, а не доверяем Content-Length.
 */
export async function fetchBytes(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Uint8Array> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const message = `HTTP ${res.status} от ${new URL(url).host}: ${body.slice(0, 200)}`;
    // 4xx (кроме 408/429) — повтор не поможет
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      throw new PermanentProviderError(message);
    }
    throw new Error(message);
  }
  return readLimited(res);
}

/** Тело ответа целиком, с обрывом при превышении MAX_RESULT_BYTES */
export async function readLimited(res: Response): Promise<Uint8Array> {
  if (!res.body) throw new Error('Пустой ответ провайдера');

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESULT_BYTES) {
      await reader.cancel();
      throw new PermanentProviderError('Ответ провайдера слишком большой');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export function toDataUri(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}
