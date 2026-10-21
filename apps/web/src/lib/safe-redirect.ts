/**
 * Нормализует callbackUrl: только относительные пути внутри приложения.
 * Защита от open redirect вида ?callbackUrl=https://evil.example
 * или протокол-относительных //evil.example и /\evil.example.
 */
export function safeCallbackUrl(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // Не возвращаем пользователя обратно на страницы авторизации
  if (/^\/(login|register|forgot-password|reset-password)(\/|\?|$)/.test(value)) return fallback;
  return value;
}
