/**
 * Адреса внутренней сети (защита от SSRF): loopback, частные диапазоны,
 * link-local и метаданные облаков (169.254.169.254), CGNAT, multicast,
 * IPv6 ULA/link-local и IPv4-mapped. Без node:net — модуль общий для web и worker.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Private(ip: string): boolean {
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** true — адрес внутренний или вообще не IP (такие не пускаем) */
export function isPrivateIp(ip: string): boolean {
  if (IPV4.test(ip)) return ipv4Private(ip);
  const v = ip.toLowerCase();
  if (!v.includes(':')) return true;
  if (v === '::' || v === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)?.[1];
  if (mapped) return ipv4Private(mapped);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

/** Имена, которые всегда указывают внутрь */
export function isInternalHostname(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')
  );
}
