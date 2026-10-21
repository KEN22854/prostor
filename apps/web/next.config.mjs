import { fileURLToPath } from 'node:url';

// Один .env в корне монорепо на все приложения: npm-скрипты web запускают
// next через `dotenv -e ../../.env`. Вызов loadEnvConfig здесь не работает —
// Next при старте восстанавливает process.env и затирает подгруженное.
// В Docker переменные приходят из окружения контейнера.
const monorepoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** S3/MinIO-хост для next/image (публичный URL бакета) */
const s3PublicUrl = process.env.S3_PUBLIC_ENDPOINT ? new URL(process.env.S3_PUBLIC_ENDPOINT) : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone-сборка для Docker: в образ попадает только трассированный код.
  output: 'standalone',
  // E2E-сборка — в отдельной папке: иначе она перезаписывала бы .next запущенного
  // рядом `npm run dev`, и dev-сервер падал с «Cannot read properties of undefined (reading 'call')»
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // В монорепо трассировка должна начинаться от корня, иначе
  // packages/* и hoisted node_modules не попадут в .next/standalone.
  outputFileTracingRoot: monorepoRoot,
  // Workspaces поставляются как TypeScript-исходники.
  transpilePackages: ['@prostor/shared', '@prostor/db'],
  // Серверные библиотеки очередей не бандлим: BullMQ опционально подключает
  // клиент Valkey, и webpack падал бы с «Module not found». В standalone-сборку
  // они попадают через трассировку node_modules.
  serverExternalPackages: ['bullmq', 'ioredis', 'undici'],
  reactStrictMode: true,
  // Плашка dev-индикатора Next перекрывает панель зума холста в углу экрана.
  // Ошибки сборки и рантайма по-прежнему показываются оверлеем.
  devIndicators: false,
  poweredByHeader: false,

  experimental: {
    // Tree-shaking «бочек» — lucide-react иначе тянет тысячи иконок в dev-сборку.
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },

  images: {
    remotePatterns: s3PublicUrl
      ? [
          {
            protocol: /** @type {'http' | 'https'} */ (s3PublicUrl.protocol.replace(':', '')),
            hostname: s3PublicUrl.hostname,
            port: s3PublicUrl.port,
          },
        ]
      : [],
  },

  // Dev: скомпилированные страницы не выгружаются через минуту простоя —
  // иначе долгий сценарий (e2e, демо) ловит повторную компиляцию посреди работы.
  onDemandEntries: { maxInactiveAge: 60 * 60_000, pagesBufferLength: 50 },

  webpack(config, { dev }) {
    // Konva в Node пытается подключить нативный пакет `canvas`.
    // Канвас рендерится только на клиенте, поэтому модуль просто отключаем.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    if (dev) {
      // Артефакты Playwright пишутся рядом с исходниками; без исключения каждый
      // скриншот/трейс запускал пересборку и HMR-перезагрузку открытых страниц.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/test-results/**',
          '**/playwright-report/**',
          '**/e2e/**',
        ],
      };
    }
    return config;
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
