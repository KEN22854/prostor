import 'server-only';
import type { Provider } from 'next-auth/providers';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import VK from 'next-auth/providers/vk';
import Yandex from 'next-auth/providers/yandex';
import type { ServerEnv } from '@/lib/env';

export type OAuthProviderId = 'google' | 'github' | 'yandex' | 'vk' | 'oidc';

export interface OAuthProviderInfo {
  id: OAuthProviderId;
  name: string;
}

/** Метаданные для кнопок входа: провайдер показывается, только если заданы ключи */
export function enabledOAuthProviders(e: ServerEnv): OAuthProviderInfo[] {
  const list: OAuthProviderInfo[] = [];
  // Корпоративный SSO — первым: в on-prem это обычно основной способ входа
  if (e.AUTH_OIDC_ISSUER && e.AUTH_OIDC_ID && e.AUTH_OIDC_SECRET)
    list.push({ id: 'oidc', name: e.AUTH_OIDC_NAME });
  if (e.AUTH_YANDEX_ID && e.AUTH_YANDEX_SECRET) list.push({ id: 'yandex', name: 'Яндекс ID' });
  if (e.AUTH_VK_ID && e.AUTH_VK_SECRET) list.push({ id: 'vk', name: 'VK ID' });
  if (e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET) list.push({ id: 'google', name: 'Google' });
  if (e.AUTH_GITHUB_ID && e.AUTH_GITHUB_SECRET) list.push({ id: 'github', name: 'GitHub' });
  return list;
}

/**
 * VK может не вернуть email (пользователь скрыл его или не подтвердил),
 * а User.email в схеме обязателен и уникален. Подставляем технический адрес,
 * который никогда не используется для рассылки (домен .invalid по RFC 2606).
 */
export function vkFallbackEmail(vkUserId: string | number): string {
  return `vk-${vkUserId}@users.prostor.invalid`;
}

/**
 * allowDangerousEmailAccountLinking — автоматическая привязка OAuth к существующему
 * аккаунту с тем же email. Включаем только у провайдеров, которые гарантируют,
 * что email подтверждён (Google, Яндекс). У GitHub/VK — нет: иначе злоумышленник,
 * указавший чужой email в профиле, получит доступ к чужому аккаунту.
 */
export function oauthProviders(e: ServerEnv): Provider[] {
  const providers: Provider[] = [];

  if (e.AUTH_OIDC_ISSUER && e.AUTH_OIDC_ID && e.AUTH_OIDC_SECRET) {
    providers.push({
      id: 'oidc',
      name: e.AUTH_OIDC_NAME,
      type: 'oidc',
      issuer: e.AUTH_OIDC_ISSUER,
      clientId: e.AUTH_OIDC_ID,
      clientSecret: e.AUTH_OIDC_SECRET,
      // Корпоративный IdP сам подтверждает почту сотрудников — привязываем к существующему аккаунту
      allowDangerousEmailAccountLinking: true,
    });
  }

  if (e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: e.AUTH_GOOGLE_ID,
        clientSecret: e.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (e.AUTH_GITHUB_ID && e.AUTH_GITHUB_SECRET) {
    providers.push(GitHub({ clientId: e.AUTH_GITHUB_ID, clientSecret: e.AUTH_GITHUB_SECRET }));
  }

  if (e.AUTH_YANDEX_ID && e.AUTH_YANDEX_SECRET) {
    providers.push(
      Yandex({
        clientId: e.AUTH_YANDEX_ID,
        clientSecret: e.AUTH_YANDEX_SECRET,
        authorization:
          'https://oauth.yandex.ru/authorize?scope=login:email+login:info+login:avatar',
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (e.AUTH_VK_ID && e.AUTH_VK_SECRET) {
    providers.push(
      VK({
        clientId: e.AUTH_VK_ID,
        clientSecret: e.AUTH_VK_SECRET,
        // VK отдаёт числовой id; Auth.js ожидает строку для providerAccountId/User.id
        profile(profile) {
          const id = String(profile.id);
          return {
            id,
            name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null,
            email: profile.email ?? vkFallbackEmail(id),
            image: profile.photo_100 ?? null,
          };
        },
      }),
    );
  }

  return providers;
}
