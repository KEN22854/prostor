/**
 * Нагрузочный тест WS-сервера: N настоящих Yjs-клиентов (y-websocket) на одной доске.
 * Каждый клиент двигает свой стикер с заданной частотой; остальные клиенты
 * замеряют задержку доставки (от записи до появления у получателя).
 *
 *   npm run load-test -w @prostor/ws-server -- --clients 50 --rate 5 --seconds 20
 *
 * Нужны запущенные Postgres, Redis и WS-сервер (WS_URL, по умолчанию ws://localhost:1234).
 * Скрипт сам создаёт временного пользователя и доску и удаляет их в конце.
 * Токены подписываются WS_JWT_SECRET — запускать на стороне оператора сервера.
 */
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { prisma } from '@prostor/db';
import { WS_TOKEN_AUDIENCE, WS_TOKEN_ISSUER, Y_KEYS, boardRoomName } from '@prostor/shared';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const CLIENTS = arg('clients', 30);
const RATE = arg('rate', 5); // правок в секунду на клиента
const SECONDS = arg('seconds', 15);
const WS_URL = process.env.WS_URL ?? 'ws://localhost:1234';
const SECRET = process.env.WS_JWT_SECRET;
/** WS-сервер пускает только разрешённые Origin (WS_ALLOWED_ORIGINS) — представляемся приложением */
const ORIGIN = process.env.APP_URL ?? 'http://localhost:3000';

class OriginWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols, { headers: { origin: ORIGIN } });
  }
}

function percentile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

async function main(): Promise<void> {
  if (!SECRET) throw new Error('WS_JWT_SECRET не задан');
  const secret = new TextEncoder().encode(SECRET);
  const tag = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({ data: { email: `load-${tag}@prostor.invalid`, name: 'Load test' } });
  const board = await prisma.board.create({
    data: { title: `Load test ${tag}`, ownerId: owner.id, members: { create: { userId: owner.id, role: 'OWNER' } } },
  });

  const latencies: number[] = [];
  let sent = 0;
  const providers: WebsocketProvider[] = [];
  const docs: Y.Doc[] = [];

  try {
    for (let i = 0; i < CLIENTS; i++) {
      const token = await new SignJWT({ boardId: board.id, role: 'OWNER', name: `Клиент ${i}`, color: '#4f46e5', anonymous: false })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(owner.id)
        .setIssuer(WS_TOKEN_ISSUER)
        .setAudience(WS_TOKEN_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(secret);
      const doc = new Y.Doc();
      const provider = new WebsocketProvider(WS_URL, boardRoomName(board.id), doc, {
        params: { token },
        WebSocketPolyfill: OriginWebSocket as unknown as typeof globalThis.WebSocket,
        disableBc: true,
      });
      const self = `client-${i}`;
      // Задержка: время записи (ts) → момент, когда правку увидел этот клиент
      doc.getMap<unknown>(Y_KEYS.elements).observeDeep((events, tr) => {
        if (tr.local) return;
        const now = Date.now();
        for (const e of events) {
          const target = e.target instanceof Y.Map ? (e.target as Y.Map<unknown>) : null;
          const ts = target?.get('ts');
          if (typeof ts === 'number' && target?.get('owner') !== self) latencies.push(now - ts);
        }
      });
      docs.push(doc);
      providers.push(provider);
    }

    await Promise.all(
      providers.map(
        (p) => new Promise<void>((resolve, reject) => {
          if (p.synced) {
            resolve();
            return;
          }
          const timer = setTimeout(() => reject(new Error('Клиент не синхронизировался за 15 с')), 15_000);
          p.once('sync', (synced: boolean) => {
            if (synced) {
              clearTimeout(timer);
              resolve();
            }
          });
        }),
      ),
    );
    console.log(`[load] подключено и синхронизировано клиентов: ${CLIENTS}`);

    // У каждого клиента свой стикер
    docs.forEach((doc, i) =>
      doc.transact(() => {
        const el = new Y.Map<unknown>();
        el.set('type', 'sticky');
        el.set('owner', `client-${i}`);
        el.set('x', i * 220);
        el.set('y', 0);
        doc.getMap<unknown>(Y_KEYS.elements).set(`load-${i}`, el);
      }),
    );
    await new Promise((r) => setTimeout(r, 1_000));
    latencies.length = 0;

    const started = Date.now();
    const timers = docs.map((doc, i) =>
      setInterval(() => {
        const el = doc.getMap<unknown>(Y_KEYS.elements).get(`load-${i}`) as Y.Map<unknown> | undefined;
        if (!el) return;
        doc.transact(() => {
          el.set('x', (el.get('x') as number) + 1);
          el.set('ts', Date.now());
        });
        sent++;
      }, 1000 / RATE),
    );
    await new Promise((r) => setTimeout(r, SECONDS * 1000));
    timers.forEach(clearInterval);
    await new Promise((r) => setTimeout(r, 1_000));
    const elapsed = (Date.now() - started) / 1000;

    const sorted = [...latencies].sort((a, b) => a - b);
    const expected = sent * (CLIENTS - 1);
    const result = {
      clients: CLIENTS,
      updatesPerSecond: Math.round(sent / elapsed),
      deliveriesPerSecond: Math.round(latencies.length / elapsed),
      delivered: `${((latencies.length / Math.max(1, expected)) * 100).toFixed(1)}%`,
      latencyMs: {
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        max: sorted[sorted.length - 1] ?? 0,
      },
    };
    console.log(`[load] ${JSON.stringify(result, null, 2)}`);
  } finally {
    providers.forEach((p) => p.destroy());
    docs.forEach((d) => d.destroy());
    await prisma.board.delete({ where: { id: board.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: owner.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[load] ошибка', error);
  process.exit(1);
});
