import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

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
