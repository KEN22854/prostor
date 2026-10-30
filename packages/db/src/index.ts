import { PrismaClient } from '@prisma/client';

// Явный список вместо `export * from '@prisma/client'`: клиент Prisma — CommonJS, и
// Turbopack на каждой странице предупреждал, что `export *` из него разбирается
// только во время выполнения. Типы моделей — через `export type *` (стираются при сборке).
export type * from '@prisma/client';
export {
  Prisma,
  PrismaClient,
  Role,
  OrgRole,
  Plan,
  PaymentProvider,
  PaymentStatus,
  BoardVisibility,
  SnapshotReason,
  AssetKind,
  AiJobType,
  AiJobStatus,
  NotificationType,
} from '@prisma/client';

/**
 * Синглтон PrismaClient.
 * В dev Next.js перезагружает модули при HMR — без кеша на globalThis
 * каждое изменение файла открывало бы новый пул соединений и быстро
 * исчерпывало max_connections в Postgres.
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

export * from './access';
