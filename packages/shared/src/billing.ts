import { z } from 'zod';

/**
 * Тарифы SaaS-версии. В установке на своём сервере (BILLING_ENABLED не задан)
 * лимитов нет — всё доступно без оплаты.
 */
export const PAID_PLANS = ['PRO', 'TEAM'] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type PlanId = 'FREE' | PaidPlan | 'ENTERPRISE';

export interface PlanInfo {
  id: PlanId;
  name: string;
  /** Досок в пространстве (личном или организации); null — без ограничений */
  boards: number | null;
  /** ИИ-задач (генерация, удаление фона) в месяц на человека */
  aiPerMonth: number;
  /** Цена за месяц: рубли (ЮKassa) и центы (Stripe) */
  priceRub: number;
  priceUsdCents: number;
}

export const PLANS: Record<'FREE' | PaidPlan, PlanInfo> = {
  FREE: { id: 'FREE', name: 'Free', boards: 3, aiPerMonth: 20, priceRub: 0, priceUsdCents: 0 },
  PRO: { id: 'PRO', name: 'Pro', boards: null, aiPerMonth: 500, priceRub: 490, priceUsdCents: 600 },
  TEAM: {
    id: 'TEAM',
    name: 'Team',
    boards: null,
    aiPerMonth: 2000,
    priceRub: 1490,
    priceUsdCents: 1800,
  },
};

/** Пробный период Pro (один раз на аккаунт) */
export const TRIAL_DAYS = 14;
/** Год — по цене 10 месяцев */
export const BILLING_PERIODS = [1, 12] as const;

export function periodPrice(plan: PaidPlan, months: number, currency: 'RUB' | 'USD'): number {
  const monthly = currency === 'RUB' ? PLANS[plan].priceRub * 100 : PLANS[plan].priceUsdCents;
  return monthly * (months === 12 ? 10 : months);
}

export const checkoutSchema = z.object({
  plan: z.enum(PAID_PLANS),
  months: z.union([z.literal(1), z.literal(12)]).default(1),
  provider: z.enum(['yookassa', 'stripe', 'mock']).optional(),
  /** Тариф Team — для организации (её владелец или администратор) */
  orgId: z.string().max(64).optional(),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

export interface BillingOverview {
  enabled: boolean;
  plan: PlanId;
  /** До какого момента оплачен / действует пробный период */
  until: string | null;
  trial: boolean;
  trialAvailable: boolean;
  usage: { boards: number; boardLimit: number | null; ai: number; aiLimit: number };
  providers: Array<'yookassa' | 'stripe' | 'mock'>;
  payments: Array<{
    id: string;
    plan: string;
    months: number;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
}
