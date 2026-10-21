import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prostor/db';
import type { EmailMessage } from '@prostor/shared';
import { processEmailJob } from './email';

const access = vi.fn<(...args: unknown[]) => Promise<{ title: string } | null>>();
vi.mock('@prostor/db', () => ({ resolveBoardAccess: (...args: unknown[]) => access(...args) }));

interface Row {
  id: string;
  type: string;
  payload: unknown;
  readAt: Date | null;
  emailedAt: Date | null;
  user: { id: string; email: string; emailNotifications: boolean; disabledAt: Date | null };
}

const payload = {
  boardId: 'board1',
  threadId: 'thread1',
  commentId: 'c1',
  actorId: 'u-actor',
  actorName: 'Анна',
  excerpt: 'Посмотри, @Иван',
};

function setup(overrides: Partial<Row> = {}, opts: { smtp?: boolean } = {}) {
  const row: Row = {
    id: 'n1',
    type: 'MENTION',
    payload,
    readAt: null,
    emailedAt: null,
    user: { id: 'u1', email: 'ivan@prostor.test', emailNotifications: true, disabledAt: null },
    ...overrides,
  };
  const sent: EmailMessage[] = [];
  const prisma = {
    notification: {
      findUnique: vi.fn(async () => row),
      update: vi.fn(async ({ data }: { data: Partial<Row> }) => Object.assign(row, data)),
    },
  } as unknown as PrismaClient;
  const deps = {
    prisma,
    appUrl: 'https://prostor.example/',
    send: opts.smtp === false ? null : vi.fn(async (m: EmailMessage) => void sent.push(m)),
  };
  const job = { data: { kind: 'notification', notificationId: 'n1' } } as Job;
  return { row, sent, deps, job };
}

describe('processEmailJob', () => {
  beforeEach(() => {
    access.mockReset();
    access.mockResolvedValue({ title: 'Ретро' });
  });

  it('отправляет письмо со ссылкой на тред и отмечает emailedAt', async () => {
    const { row, sent, deps, job } = setup();
    expect(await processEmailJob(job, deps)).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('ivan@prostor.test');
    expect(sent[0]?.subject).toContain('Анна упомянул(а) вас на доске «Ретро»');
    expect(sent[0]?.text).toContain('https://prostor.example/board/board1?thread=thread1');
    expect(row.emailedAt).toBeInstanceOf(Date);
  });

  it('прочитано в приложении, отключено в настройках, нет доступа — без письма', async () => {
    for (const [overrides, reason] of [
      [{ readAt: new Date() }, 'already_read'],
      [{ emailedAt: new Date() }, 'already_sent'],
      [
        { user: { id: 'u1', email: 'x@y.z', emailNotifications: false, disabledAt: null } },
        'opted_out',
      ],
    ] as const) {
      const { sent, deps, job } = setup(overrides as Partial<Row>);
      expect(await processEmailJob(job, deps)).toEqual({ sent: false, reason });
      expect(sent).toHaveLength(0);
    }
    access.mockResolvedValue(null);
    const { sent, deps, job } = setup();
    expect(await processEmailJob(job, deps)).toEqual({ sent: false, reason: 'no_access' });
    expect(sent).toHaveLength(0);
  });

  it('без SMTP письма пропускаются, некорректная задача — без повторов', async () => {
    const { deps, job } = setup({}, { smtp: false });
    expect(await processEmailJob(job, deps)).toEqual({ sent: false, reason: 'smtp_disabled' });
    await expect(processEmailJob({ data: { kind: 'x' } } as Job, deps)).rejects.toThrow(
      'Некорректная задача',
    );
  });
});
