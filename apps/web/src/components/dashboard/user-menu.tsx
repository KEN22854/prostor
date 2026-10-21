import { LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { NotificationsBell } from '@/components/notifications/notifications-bell';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/auth/actions';

interface UserMenuProps {
  name: string | null;
  email: string;
}

export function UserMenu({ name, email }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right text-sm sm:block">
        <div className="font-medium leading-tight">{name ?? email}</div>
        {name ? <div className="text-xs text-muted-foreground">{email}</div> : null}
      </div>
      <NotificationsBell />
      <Button asChild variant="ghost" size="icon" aria-label="Настройки аккаунта">
        <Link href="/settings">
          <Settings />
        </Link>
      </Button>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="sm">
          <LogOut />
          Выйти
        </Button>
      </form>
    </div>
  );
}
