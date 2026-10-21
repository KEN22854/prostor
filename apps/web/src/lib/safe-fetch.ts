import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isInternalHostname, isPrivateIp } from '@prostor/shared';
import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici';

/**
 * Загрузка внешних страниц по ссылкам пользователей (превью ссылок) без SSRF.
 *
 * Пользователь может прислать адрес внутренней сети (http://10.0.0.5/admin,
 * http://169.254.169.254/ — метаданные облака) или ссылку, которая
 * редиректит туда. Поэтому:
 *  - только http/https и стандартные порты;
 *  - имя разрешается в IP, и все адреса проверяются на «внутренность»;
 *  - редиректы обрабатываются вручную, каждый шаг проверяется заново;
 *  - таймаут и лимит размера ответа.
 * Остаточный риск DNS-rebinding (адрес сменился между проверкой и
 * соединением) закрывается сетевыми правилами egress в проде.
 *
 * Исходящий прокси (HTTPS_PROXY / HTTP_PROXY, как у curl) поддерживается:
 * встроенный fetch Node его не учитывает. За прокси имя может не
 * разрешаться локально — тогда доверяем прокси, но адреса-литералы и
 * внутренние имена по-прежнему запрещены.
 */

let proxyDispatcher: Dispatcher | null | undefined;
function outboundProxy(): Dispatcher | null {
  if (proxyDispatcher !== undefined) return proxyDispatcher;
  // OUTBOUND_PROXY — явная настройка в .env; иначе стандартные переменные, как у curl
  const proxy =
    process.env.OUTBOUND_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  proxyDispatcher = proxy ? new ProxyAgent(proxy) : null;
  return proxyDispatcher;
}

/** Адрес запрещён: внутренняя сеть, нестандартный порт, не http(s) */
export class UnsafeUrlError extends Error {}
/** Сайт недоступен (нет такого имени, таймаут) — превью без метаданных */
export class UnreachableError extends Error {}

const MAX_REDIRECTS = 4;

export function isPrivateAddress(ip: string): boolean {
  return isIP(ip) === 0 || isPrivateIp(ip);
}

export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new UnsafeUrlError('Схема не поддерживается');
  if (url.username || url.password) throw new UnsafeUrlError('Ссылки с логином не поддерживаются');
  if (url.port && url.port !== '80' && url.port !== '443')
    throw new UnsafeUrlError('Нестандартный порт');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isInternalHostname(host)) {
    throw new UnsafeUrlError('Внутренний адрес');
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = isIP(host) ? [{ address: host }] : await lookupWithTimeout(host);
  } catch (error) {
    // За прокси имя разрешает прокси (локальный DNS может не знать или долго
    // не отвечать про заблокированный сайт); без прокси — сайт недоступен
    const code = (error as { code?: string }).code;
    if (outboundProxy() && (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ETIMEOUT')) {
      return url;
    }
    throw new UnreachableError('Сайт не найден');
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError('Внутренний адрес');
  }
  return url;
}

/** DNS с таймаутом: за прокси локальный DNS может «висеть» по 10 секунд на заблокированных именах */
async function lookupWithTimeout(host: string): Promise<Array<{ address: string }>> {
  const timeoutMs = outboundProxy() ? 1_500 : 5_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([lookup(host, { all: true, verbatim: true }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface SafeResponse {
  url: URL;
  status: number;
  contentType: string;
  body: Uint8Array;
}

/** GET с проверкой каждого шага редиректа; тело — не больше maxBytes (дальше обрезается) */
export async function safeFetch(
  raw: string,
  opts: { maxBytes: number; timeoutMs: number; accept?: string },
): Promise<SafeResponse> {
  let url = await assertPublicUrl(raw);
  // Таймаут — на сами запросы, после проверки адреса
  const deadline = AbortSignal.timeout(opts.timeoutMs);
  for (let hop = 0; ; hop++) {
    const dispatcher = outboundProxy();
    const res = await undiciFetch(url, {
      redirect: 'manual',
      signal: deadline,
      ...(dispatcher ? { dispatcher } : {}),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ProstorLinkPreview/1.0)',
        accept: opts.accept ?? 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5',
        'accept-language': 'ru,en;q=0.8',
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel();
      if (hop >= MAX_REDIRECTS) throw new UnsafeUrlError('Слишком много перенаправлений');
      url = await assertPublicUrl(new URL(res.headers.get('location') ?? '', url));
      continue;
    }
    const body = await readCapped(res, opts.maxBytes);
    return { url, status: res.status, contentType: res.headers.get('content-type') ?? '', body };
  }
}

async function readCapped(
  res: { body: ReadableStream<Uint8Array> | null },
  maxBytes: number,
): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    chunks.push(value.byteLength > room ? value.subarray(0, room) : value);
    total += Math.min(value.byteLength, room);
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
