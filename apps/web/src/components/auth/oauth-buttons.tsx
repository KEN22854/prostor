import { Button } from '@/components/ui/button';
import { oauthSignInAction } from '@/lib/auth/actions';
import type { OAuthProviderInfo } from '@/lib/auth/oauth-providers';

/** Цветные монограммы вместо логотипов брендов (без лицензионных вопросов) */
const BADGE: Record<OAuthProviderInfo['id'], { letter: string; className: string }> = {
  yandex: { letter: 'Я', className: 'bg-[#fc3f1d] text-white' },
  vk: { letter: 'VK', className: 'bg-[#0077ff] text-white text-[9px]' },
  google: { letter: 'G', className: 'bg-white text-[#4285f4] ring-1 ring-border' },
  github: { letter: 'GH', className: 'bg-[#24292f] text-white text-[9px]' },
  oidc: { letter: 'SSO', className: 'bg-primary text-primary-foreground text-[8px]' },
};

interface OAuthButtonsProps {
  providers: OAuthProviderInfo[];
  callbackUrl: string;
}

/**
 * Server Component: каждая кнопка — отдельная <form> с Server Action,
 * поэтому вход через OAuth работает даже до гидрации и без JS.
 */
export function OAuthButtons({ providers, callbackUrl }: OAuthButtonsProps) {
  if (providers.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {providers.map((p) => {
          const badge = BADGE[p.id];
          return (
            <form key={p.id} action={oauthSignInAction}>
              <input type="hidden" name="provider" value={p.id} />
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <Button type="submit" variant="outline" className="w-full">
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${badge.className}`}
                  aria-hidden
                >
                  {badge.letter}
                </span>
                {p.name}
              </Button>
            </form>
          );
        })}
      </div>
      <div className="relative text-center text-xs uppercase text-muted-foreground">
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
        <span className="relative bg-card px-2">или по email</span>
      </div>
    </div>
  );
}
