import { describe, expect, it } from 'vitest';
import { checkoutSchema, periodPrice, PLANS } from './billing';

describe('тарифы', () => {
  it('цена периода: год — по цене 10 месяцев, в копейках и центах', () => {
    expect(periodPrice('PRO', 1, 'RUB')).toBe(PLANS.PRO.priceRub * 100);
    expect(periodPrice('PRO', 12, 'RUB')).toBe(PLANS.PRO.priceRub * 100 * 10);
    expect(periodPrice('TEAM', 1, 'USD')).toBe(PLANS.TEAM.priceUsdCents);
  });

  it('оформление: только платные тарифы и периоды 1 или 12 месяцев', () => {
    expect(checkoutSchema.parse({ plan: 'PRO' }).months).toBe(1);
    expect(checkoutSchema.safeParse({ plan: 'FREE' }).success).toBe(false);
    expect(checkoutSchema.safeParse({ plan: 'PRO', months: 6 }).success).toBe(false);
  });
});
