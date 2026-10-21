'use server';

import { z } from 'zod';
import { signIn, signOut } from '@/auth';
import { safeCallbackUrl } from '@/lib/safe-redirect';

const oauthSchema = z.object({
  provider: z.enum(['google', 'github', 'yandex', 'vk', 'oidc']),
  callbackUrl: z.string().max(2048).optional(),
});

/** Server Action для кнопок «Войти через …»: редирект на страницу провайдера */
export async function oauthSignInAction(formData: FormData): Promise<void> {
  const parsed = oauthSchema.safeParse({
    provider: formData.get('provider'),
    callbackUrl: formData.get('callbackUrl') ?? undefined,
  });
  if (!parsed.success) return;
  // signIn бросает NEXT_REDIRECT — это штатный механизм редиректа из Server Action
  await signIn(parsed.data.provider, { redirectTo: safeCallbackUrl(parsed.data.callbackUrl) });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}
