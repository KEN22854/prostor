import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

/**
 * Демо-данные для локальной разработки.
 * Учётки: demo@prostor.local / alice@prostor.local, пароль — SEED_PASSWORD
 * (по умолчанию "prostor-dev-123"; не используйте seed в проде).
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed запрещён в production');
  }

  const password = process.env.SEED_PASSWORD ?? 'prostor-dev-123';
  const passwordHash = await bcrypt.hash(password, 12);

  const demo = await prisma.user.upsert({
    where: { email: 'demo@prostor.local' },
    update: {},
    create: {
      email: 'demo@prostor.local',
      name: 'Демо Пользователь',
      passwordHash,
      emailVerified: new Date(),
    },
  });

  const alice = await prisma.user.upsert({
    where: { email: 'alice@prostor.local' },
    update: {},
    create: {
      email: 'alice@prostor.local',
      name: 'Алиса',
      passwordHash,
      emailVerified: new Date(),
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Team',
      slug: 'demo',
      plan: 'ENTERPRISE',
      members: {
        create: [
          { userId: demo.id, role: 'OWNER' },
          { userId: alice.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const folder = await prisma.folder.create({
    data: { name: 'Продукт', ownerId: demo.id, orgId: org.id },
  });
  await prisma.folder.update({
    where: { id: folder.id },
    data: { path: `/${folder.id}/` },
  });

  await prisma.board.create({
    data: {
      title: 'Ретро спринта',
      ownerId: demo.id,
      orgId: org.id,
      folderId: folder.id,
      templateKey: 'retro',
      members: {
        create: [
          { userId: demo.id, role: 'OWNER' },
          { userId: alice.id, role: 'EDITOR' },
        ],
      },
    },
  });

  console.log(`Seed готов: ${demo.email}, ${alice.email} (пароль: ${password})`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
