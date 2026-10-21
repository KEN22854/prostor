import { LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/language-switcher';
import { NotificationsBell } from '@/components/notifications/notifications-bell';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/auth/actions';
import { getT } from '@/lib/i18n/server';

interface UserMenuProps {
  name: string | null;
  email: string;
}

export async function UserMenu({ name, email }: UserMenuProps) {
  const t = await getT();
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right text-sm sm:block">
        <div className="font-medium leading-tight">{name ?? email}</div>
        {name ? <div className="text-xs text-muted-foreground">{email}</div> : null}
      </div>
      <LanguageSwitcher className="hidden md:flex" />
      <NotificationsBell />
      <Button asChild variant="ghost" size="icon" aria-label={t('Настройки аккаунта')}>
        <Link href="/settings">
          <Settings />
        </Link>
      </Button>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="sm">
          <LogOut />
          {t('Выйти')}
        </Button>
      </form>
    </div>
  );
}
