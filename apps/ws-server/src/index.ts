import { createServer } from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { prisma } from '@prostor/db';
import { LIMITS, REDIS_CHANNELS, controlEventSchema } from '@prostor/shared';
import { WsAuthError, authenticate } from './auth';
import { loadEnv } from './env';
import { PubSub } from './pubsub';
import { RoomManager } from './room-manager';

const env = loadEnv();
const secret = new TextEncoder().encode(env.WS_JWT_SECRET);
const pubsub = new PubSub(env.REDIS_URL);
const rooms = new RoomManager(env, pubsub);

const server = createServer((req, res) => {
  if (req.url === '/health') {
    void rooms.stats().then((stats) => {
      const redisOk = pubsub.ready;
      res.writeHead(redisOk ? 200 : 503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: redisOk ? 'ok' : 'degraded',
          redis: redisOk ? 'ok' : 'down',
          instance: env.WS_INSTANCE_ID,
          ...stats,
        }),
      );
    });
    return;
  }
  res.writeHead(404).end();
});

// noServer: upgrade обрабатываем сами — проверяем Origin до рукопожатия
const wss = new WebSocketServer({
  noServer: true,
  // Немного больше лимита апдейта: заголовки протокола + awareness
  maxPayload: LIMITS.maxYjsUpdateBytes + 64 * 1024,
  perMessageDeflate: false,
});

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  if (env.WS_ALLOWED_ORIGINS.length > 0 && (!origin || !env.WS_ALLOWED_ORIGINS.includes(origin))) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    void onConnection(ws, req);
  });
});

function toUint8Array(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Рукопожатие уже принято, авторизация асинхронная (JWT + запрос прав в БД).
 * Отказ — через close с кодом 44xx: браузер видит код и понимает,
 * нужно ли обновить токен (4401) или доступа нет (4403/4404).
 * HTTP 401 на upgrade браузер отдал бы как безликий 1006.
 */
async function onConnection(ws: WebSocket, req: Parameters<typeof authenticate>[0]): Promise<void> {
  // Клиент шлёт sync step1 и awareness сразу после открытия — буферизуем до авторизации
  const early: Uint8Array[] = [];
  const buffer = (data: RawData) => early.push(toUint8Array(data));
  ws.on('message', buffer);
  ws.on('error', (error) => console.warn('[ws] socket error', error.message));

  try {
    const auth = await authenticate(req, secret);
    const room = await rooms.get(auth.boardId);
    if (ws.readyState !== ws.OPEN) return;

    const conn = room.addConn(ws, auth);
    ws.off('message', buffer);
    const handle = (data: Uint8Array) => {
      try {
        room.handleMessage(conn, data);
      } catch (error: unknown) {
        console.error(`[ws] message handling failed (board ${auth.boardId})`, error);
      }
    };
    ws.on('message', (data) => handle(toUint8Array(data)));
    for (const message of early) handle(message);
  } catch (error: unknown) {
    if (error instanceof WsAuthError) {
      ws.close(error.closeCode, error.message);
    } else {
      console.error('[ws] connection setup failed', error);
      ws.close(1011, 'internal error');
    }
  }
}

// Keepalive: прокси и NAT рвут «молчащие» соединения; заодно чистим мёртвые сокеты
const heartbeat = setInterval(() => {
  void rooms.all().then((all) => {
    for (const room of all) {
      for (const conn of room.conns.values()) {
        if (!conn.isAlive) {
          conn.ws.terminate();
          continue;
        }
        conn.isAlive = false;
        conn.ws.ping();
      }
    }
  });
}, 30_000);

// Не блокируем старт: без Redis сервер должен отвечать на /health (и сообщать о проблеме),
// подписка восстановится, когда Redis станет доступен.
void pubsub
  .subscribe(REDIS_CHANNELS.control, (message) => {
    try {
      const parsed = controlEventSchema.safeParse(JSON.parse(message.toString('utf8')));
      if (parsed.success) void rooms.handleControl(parsed.data);
    } catch (error: unknown) {
      console.error('[ws] bad control message', error);
    }
  })
  .catch((error: unknown) => console.error('[ws] control subscription failed', error));

server.listen(env.WS_PORT, env.WS_HOST, () => {
  console.log(`[ws] ${env.WS_INSTANCE_ID} listening on ${env.WS_HOST}:${env.WS_PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[ws] ${signal}, saving rooms and shutting down`);
  clearInterval(heartbeat);
  // Не ждём зависшие операции дольше 15 с
  setTimeout(() => process.exit(1), 15_000).unref();
  server.close();
  await rooms.closeAll();
  await pubsub.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
// Неперехваченная ошибка в одном соединении не должна ронять всех
process.on('unhandledRejection', (reason) => console.error('[ws] unhandled rejection', reason));
