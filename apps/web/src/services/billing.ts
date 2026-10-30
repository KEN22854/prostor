import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma, type Plan } from '@prostor/db';
import {
  PLANS,
  TRIAL_DAYS,
  checkoutSchema,
  periodPrice,
  type BillingOverview,
  type CheckoutInput,
  type PlanId,
} from '@prostor/shared';
import { ApiError } from '@/lib/api';
import { env } from '@/lib/env';
import type { SessionUser } from '@/lib/session';
import { audit } from '@/services/audit';

/**
 * Тарифы SaaS: Free (3 доски, 20 ИИ-задач в месяц), Pro и Team без лимита
 * досок, пробный Pro на 14 дней. Оплата разовая за период (месяц или год):
 * ЮKassa (рубли) или Stripe (доллары). Платёж подтверждает вебхук провайдера —
 * повторное уведомление ничего не начисляет дважды.
 */
const DAY = 24 * 3600_000;

export function billingEnabled(): boolean {
  return env().BILLING_ENABLED;
}

function providers(): BillingOverview['providers'] {
  const e = env();
  const list: BillingOverview['providers'] = [];
  if (e.YOOKASSA_SHOP_ID && e.YOOKASSA_SECRET_KEY) list.push('yookassa');
  if (e.STRIPE_SECRET_KEY) list.push('stripe');
  if (e.BILLING_MOCK && e.NODE_ENV !== 'production') list.push('mock');
  return list;
}

const active = (plan: Plan, until: Date | null) =>
  plan !== 'FREE' && (until === null || until.getTime() > Date.now());

/** Действующий тариф пользователя: личный или лучший из его организаций */
export async function effectivePlan(userId: string): Promise<{
  plan: PlanId;
  personal: { plan: PlanId; until: Date | null };
}> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      plan: true,
      planUntil: true,
      orgMemberships: { select: { org: { select: { plan: true, planUntil: true } } } },
    },
  });
  const personal: PlanId = active(user.plan, user.planUntil) ? user.plan : 'FREE';
  // Участник оплаченной организации пользуется её тарифом (лучшим из нескольких)
  const orgPlans = user.orgMemberships
    .filter((m) => active(m.org.plan, m.org.planUntil))
    .map((m) => m.org.plan);
  const orgPlan: PlanId | null = orgPlans.includes('ENTERPRISE')
    ? 'ENTERPRISE'
    : orgPlans.length > 0
      ? 'TEAM'
      : null;
  const rank: Record<PlanId, number> = { FREE: 0, PRO: 1, TEAM: 2, ENTERPRISE: 3 };
  const plan: PlanId = orgPlan && rank[orgPlan] > rank[personal] ? orgPlan : personal;
  return { plan, personal: { plan: personal, until: user.planUntil } };
}

/** Лимиты тарифа; Enterprise — как Team */
const limitsOf = (plan: PlanId) =>
  plan === 'FREE' ? PLANS.FREE : plan === 'PRO' ? PLANS.PRO : PLANS.TEAM;

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

/** Новая доска в пространстве: на Free — не больше 3 (личных или организации без тарифа) */
export async function requireBoardQuota(userId: string, orgId: string | null): Promise<void> {
  if (!billingEnabled()) return;
  if (orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true, planUntil: true },
    });
    if (org && active(org.plan, org.planUntil)) return;
    const count = await prisma.board.count({ where: { orgId, deletedAt: null } });
    if (count >= (PLANS.FREE.boards ?? Infinity))
      throw new ApiError(
        402,
        'plan_limit',
        `В бесплатной организации — до ${PLANS.FREE.boards} досок. Подключите тариф Team`,
      );
    return;
  }
  const { personal } = await effectivePlan(userId);
  if (personal.plan !== 'FREE') return;
  const count = await prisma.board.count({
    where: { ownerId: userId, orgId: null, deletedAt: null },
  });
  if (count >= (PLANS.FREE.boards ?? Infinity))
    throw new ApiError(
      402,
      'plan_limit',
      `На бесплатном тарифе — до ${PLANS.FREE.boards} личных досок. Попробуйте Pro бесплатно`,
    );
}

/** ИИ-задача: месячная квота по тарифу */
export async function requireAiQuota(userId: string): Promise<void> {
  if (!billingEnabled()) return;
  const { plan } = await effectivePlan(userId);
  const used = await prisma.aiJob.count({
    where: { userId, createdAt: { gte: monthStart() }, status: { not: 'FAILED' } },
  });
  const limit = limitsOf(plan).aiPerMonth;
  if (used >= limit)
    throw new ApiError(
      402,
      'plan_limit',
      plan === 'FREE'
        ? `ИИ-задачи на бесплатном тарифе закончились (${limit} в месяц). Попробуйте Pro`
        : `Лимит ИИ-задач в этом месяце исчерпан (${limit})`,
    );
}

export async function billingOverview(user: SessionUser): Promise<BillingOverview> {
  const [{ plan, personal }, me, boards, ai, payments] = await Promise.all([
    effectivePlan(user.id),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { trialUsedAt: true } }),
    prisma.board.count({ where: { ownerId: user.id, orgId: null, deletedAt: null } }),
    prisma.aiJob.count({
      where: { userId: user.id, createdAt: { gte: monthStart() }, status: { not: 'FAILED' } },
    }),
    prisma.payment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  const paid = payments.some((p) => p.status === 'SUCCEEDED' && p.orgId === null);
  const limits = limitsOf(plan);
  return {
    enabled: billingEnabled(),
    plan,
    until: personal.plan !== 'FREE' && personal.until ? personal.until.toISOString() : null,
    trial: personal.plan === 'PRO' && me.trialUsedAt !== null && !paid,
    trialAvailable: me.trialUsedAt === null,
    usage: {
      boards,
      boardLimit: personal.plan === 'FREE' ? limits.boards : null,
      ai,
      aiLimit: limits.aiPerMonth,
    },
    providers: providers(),
    payments: payments.map((p) => ({
      id: p.id,
      plan: p.plan,
      months: p.months,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

/** Пробный Pro на 14 дней — один раз на аккаунт */
export async function startTrial(user: SessionUser): Promise<void> {
  if (!billingEnabled()) throw new ApiError(400, 'billing_disabled', 'Тарифы не используются');
  const until = new Date(Date.now() + TRIAL_DAYS * DAY);
  const updated = await prisma.user.updateMany({
    where: { id: user.id, trialUsedAt: null },
    data: { trialUsedAt: new Date(), plan: 'PRO', planUntil: until },
  });
  if (updated.count === 0)
    throw new ApiError(409, 'trial_used', 'Пробный период уже был использован');
  await audit({ action: 'billing.trial_start', actorId: user.id, metadata: { until } });
}

// ─────────────────────────── Оплата ───────────────────────────

/** Создать платёж и получить ссылку на страницу оплаты провайдера */
export async function checkout(
  user: SessionUser,
  input: CheckoutInput,
): Promise<{ paymentId: string; url: string }> {
  if (!billingEnabled()) throw new ApiError(400, 'billing_disabled', 'Тарифы не используются');
  const data = checkoutSchema.parse(input);
  const available = providers();
  const provider = data.provider ?? available[0];
  if (!provider || !available.includes(provider))
    throw new ApiError(503, 'no_provider', 'Оплата пока не настроена на этом сервере');
  if (data.plan === 'TEAM') {
    if (!data.orgId) throw new ApiError(400, 'org_required', 'Тариф Team подключается организации');
    const member = await prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId: data.orgId, userId: user.id } },
      select: { role: true },
    });
    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN'))
      throw new ApiError(
        403,
        'forbidden',
        'Оплатить тариф организации может её владелец или администратор',
      );
  }
  const currency = provider === 'stripe' ? 'USD' : 'RUB';
  const amount = periodPrice(data.plan, data.months, currency);
  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      orgId: data.plan === 'TEAM' ? (data.orgId ?? null) : null,
      plan: data.plan,
      months: data.months,
      amount,
      currency,
      provider: provider === 'yookassa' ? 'YOOKASSA' : provider === 'stripe' ? 'STRIPE' : 'MOCK',
    },
  });
  const returnUrl = `${env().APP_URL}/settings/billing?payment=${payment.id}`;
  const description = `Простор ${PLANS[data.plan].name}, ${data.months === 12 ? '1 год' : '1 месяц'}`;

  let url: string;
  let providerPaymentId: string;
  if (provider === 'mock') {
    providerPaymentId = `mock_${payment.id}`;
    url = `${env().APP_URL}/settings/billing/mock?payment=${payment.id}`;
  } else if (provider === 'yookassa') {
    const res = await yookassa('/payments', {
      method: 'POST',
      headers: { 'Idempotence-Key': payment.id },
      body: JSON.stringify({
        amount: { value: (amount / 100).toFixed(2), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: returnUrl },
        description,
        metadata: { paymentId: payment.id },
      }),
    });
    providerPaymentId = res.id as string;
    url = (res.confirmation as { confirmation_url: string }).confirmation_url;
  } else {
    const form = new URLSearchParams({
      mode: 'payment',
      success_url: returnUrl,
      cancel_url: `${env().APP_URL}/pricing`,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': description,
      'metadata[paymentId]': payment.id,
      client_reference_id: payment.id,
    });
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env().STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const body = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
    if (!res.ok || !body.url || !body.id)
      throw new ApiError(502, 'provider_error', body.error?.message ?? 'Stripe не создал платёж');
    providerPaymentId = body.id;
    url = body.url;
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerPaymentId, confirmationUrl: url },
  });
  return { paymentId: payment.id, url };
}

async function yookassa(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const e = env();
  const auth = Buffer.from(`${e.YOOKASSA_SHOP_ID}:${e.YOOKASSA_SECRET_KEY}`).toString('base64');
  const res = await fetch(`https://api.yookassa.ru/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok)
    throw new ApiError(502, 'provider_error', String(body.description ?? 'ЮKassa вернула ошибку'));
  return body;
}

/**
 * Платёж прошёл: продлить тариф. Идемпотентно — повторный вебхук или
 * одновременные уведомления не продлевают дважды (условное обновление статуса).
 */
export async function markPaymentSucceeded(paymentId: string): Promise<boolean> {
  const updated = await prisma.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: { status: 'SUCCEEDED', paidAt: new Date() },
  });
  if (updated.count === 0) return false;
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const extend = (current: Date | null, samePlan: boolean) => {
    const from = samePlan && current && current.getTime() > Date.now() ? current : new Date();
    return new Date(from.getTime() + payment.months * 30 * DAY);
  };
  if (payment.orgId) {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: payment.orgId },
      select: { plan: true, planUntil: true },
    });
    await prisma.organization.update({
      where: { id: payment.orgId },
      data: { plan: payment.plan, planUntil: extend(org.planUntil, org.plan === payment.plan) },
    });
  } else {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: payment.userId },
      select: { plan: true, planUntil: true },
    });
    await prisma.user.update({
      where: { id: payment.userId },
      data: { plan: payment.plan, planUntil: extend(user.planUntil, user.plan === payment.plan) },
    });
  }
  await audit({
    action: 'billing.payment',
    actorId: payment.userId,
    orgId: payment.orgId ?? undefined,
    metadata: { paymentId, plan: payment.plan, months: payment.months, amount: payment.amount },
  });
  return true;
}

export async function markPaymentCanceled(paymentId: string): Promise<void> {
  await prisma.payment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: { status: 'CANCELED' },
  });
}

/** Вебхук ЮKassa: статус перепроверяется запросом к API — подделать уведомление нельзя */
export async function handleYookassaWebhook(body: unknown): Promise<void> {
  const object = (body as { object?: { id?: unknown } }).object;
  if (typeof object?.id !== 'string') throw new ApiError(400, 'invalid', 'Нет id платежа');
  const real = await yookassa(`/payments/${encodeURIComponent(object.id)}`, { method: 'GET' });
  const paymentId = (real.metadata as { paymentId?: string } | undefined)?.paymentId;
  if (!paymentId) return;
  if (real.status === 'succeeded') await markPaymentSucceeded(paymentId);
  else if (real.status === 'canceled') await markPaymentCanceled(paymentId);
}

/** Вебхук Stripe: подпись Stripe-Signature (HMAC-SHA256 «t.тело») и окно 5 минут */
export async function handleStripeWebhook(raw: string, signature: string | null): Promise<void> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw new ApiError(400, 'invalid_signature', 'Нет подписи');
  const parts = Object.fromEntries(
    signature.split(',').map((kv) => kv.split('=') as [string, string]),
  );
  const t = Number(parts.t);
  const expected = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  const given = Buffer.from(parts.v1 ?? '', 'hex');
  if (
    !Number.isFinite(t) ||
    Math.abs(Date.now() / 1000 - t) > 300 ||
    given.length !== 32 ||
    !timingSafeEqual(given, Buffer.from(expected, 'hex'))
  )
    throw new ApiError(400, 'invalid_signature', 'Неверная подпись');
  const event = JSON.parse(raw) as {
    type: string;
    data: { object: { metadata?: { paymentId?: string }; payment_status?: string } };
  };
  const paymentId = event.data.object.metadata?.paymentId;
  if (!paymentId) return;
  if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid')
    await markPaymentSucceeded(paymentId);
  if (event.type === 'checkout.session.expired') await markPaymentCanceled(paymentId);
}

/** Статус своего платежа (страница возврата опрашивает, пока вебхук не придёт) */
export async function paymentStatus(user: SessionUser, id: string) {
  const payment = await prisma.payment.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true, plan: true, months: true, provider: true },
  });
  if (!payment) throw new ApiError(404, 'not_found', 'Платёж не найден');
  return payment;
}

/** Тестовая оплата (BILLING_MOCK, не в продакшене) — подтверждение «одной кнопкой» */
export async function confirmMockPayment(
  user: SessionUser,
  id: string,
  ok: boolean,
): Promise<void> {
  if (!providers().includes('mock')) throw new ApiError(404, 'not_found', 'Не найдено');
  const payment = await prisma.payment.findFirst({
    where: { id, userId: user.id, provider: 'MOCK' },
    select: { id: true },
  });
  if (!payment) throw new ApiError(404, 'not_found', 'Платёж не найден');
  if (ok) await markPaymentSucceeded(payment.id);
  else await markPaymentCanceled(payment.id);
}

/** Для тестов подписи Stripe */
export function stripeSignatureFor(secret: string, raw: string, t: number): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
}
