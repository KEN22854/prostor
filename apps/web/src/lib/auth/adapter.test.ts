import type { AdapterAccount } from 'next-auth/adapters';
import { describe, expect, it } from 'vitest';
import { pickAccountFields } from './adapter';

describe('pickAccountFields', () => {
  it('отбрасывает нестандартные поля token-ответа (VK: user_id, email)', () => {
    const vkAccount = {
      userId: 'u1',
      type: 'oauth',
      provider: 'vk',
      providerAccountId: '123',
      access_token: 'tok',
      expires_at: 100,
      user_id: 123,
      email: 'a@b.c',
      refresh_token_expires_in: 999,
    } as unknown as AdapterAccount;

    expect(pickAccountFields(vkAccount)).toEqual({
      userId: 'u1',
      type: 'oauth',
      provider: 'vk',
      providerAccountId: '123',
      access_token: 'tok',
      expires_at: 100,
    });
  });
});
