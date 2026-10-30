// Прогрев dev-сервера: Next компилирует страницу при первом заходе, и первый
// клик после запуска ждал бы сборку. Скрипт дожидается сервера и по очереди
// открывает основные страницы и API — к приходу человека они уже собраны.
//   node scripts/warmup.mjs [порт]
const port = process.argv[2] ?? process.env.PORT ?? '3000';
const base = `http://localhost:${port}`;

const ROUTES = [
  '/',
  '/pricing',
  '/login',
  '/register',
  '/dashboard',
  '/board/warmup',
  '/settings',
  '/settings/billing',
  '/org/warmup',
  '/offline',
  '/api/auth/session',
  '/api/boards',
  '/api/billing',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ping(path) {
  const started = Date.now();
  const res = await fetch(base + path, {
    headers: { 'x-prostor-warmup': '1' },
    redirect: 'manual',
  });
  await res.arrayBuffer();
  return { status: res.status, ms: Date.now() - started };
}

async function waitForServer() {
  for (let i = 0; i < 240; i++) {
    try {
      await fetch(base, { method: 'HEAD', redirect: 'manual' });
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

if (!(await waitForServer())) {
  console.log(`[warmup] сервер ${base} не ответил — пропускаю прогрев`);
  process.exit(0);
}
const started = Date.now();
for (const path of ROUTES) {
  try {
    const { status, ms } = await ping(path);
    console.log(`[warmup] ${path} → ${status} за ${ms} мс`);
  } catch (error) {
    console.log(`[warmup] ${path} → ошибка: ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`[warmup] готово за ${((Date.now() - started) / 1000).toFixed(1)} с`);
