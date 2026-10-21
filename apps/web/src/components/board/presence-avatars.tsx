'use client';

import { Eye, Megaphone, MegaphoneOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { initials } from '@prostor/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PresenceUser } from '@/hooks/use-presence';
import { countFollowers } from '@/lib/presence/follow';
import { cn, plural } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';

const MAX_VISIBLE = 5;

interface PresenceAvatarsProps {
  users: PresenceUser[];
  awareness: Awareness | null;
}

/**
 * Кто сейчас на доске: цветные аватары в цвете курсора. По клику на чужой
 * аватар — «следовать», на свой — «позвать всех за собой» (показ).
 */
export function PresenceAvatars({ users, awareness }: PresenceAvatarsProps) {
  const follow = useCanvasStore((s) => s.follow);
  const setFollow = useCanvasStore((s) => s.setFollow);
  const [presenting, setPresenting] = useState(false);
  const [followers, setFollowers] = useState(0);
  const self = users.find((u) => u.isSelf);

  useEffect(() => {
    if (!awareness) return;
    const update = () => {
      setFollowers(countFollowers(awareness, self?.id));
      setPresenting(
        Boolean((awareness.getLocalState() as { presenting?: unknown } | null)?.presenting),
      );
    };
    update();
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [awareness, self?.id]);

  if (users.length === 0) return null;
  const visible = users.slice(0, MAX_VISIBLE);
  const hidden = users.length - visible.length;

  const togglePresenting = () => {
    awareness?.setLocalStateField('presenting', presenting ? null : { since: Date.now() });
    // Ведущий сам ни за кем не следует
    if (!presenting) setFollow(null);
  };

  return (
    <div className="flex items-center -space-x-2" aria-label={`На доске: ${users.length}`}>
      {visible.map((u) => (
        <DropdownMenu key={u.id}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'relative flex size-8 items-center justify-center rounded-full border-2 border-background text-xs font-semibold text-white outline-none ring-offset-2 focus-visible:ring-2',
                follow?.userId === u.id && 'ring-2 ring-offset-1',
              )}
              style={{
                backgroundColor: u.color,
                ...(follow?.userId === u.id ? { ['--tw-ring-color' as string]: u.color } : {}),
              }}
              aria-label={`${u.name}${u.isSelf ? ' (вы)' : ''}`}
              data-testid="presence-avatar"
            >
              {initials(u.name)}
              {u.isSelf && presenting ? (
                <span
                  className="absolute -bottom-1 -right-1 rounded-full bg-primary p-0.5"
                  aria-hidden
                >
                  <Megaphone className="size-2.5" />
                </span>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {u.name}
              {u.isSelf ? ' (вы)' : ''}
              {u.connections > 1 ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  {u.connections} вкладки
                </span>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {u.isSelf ? (
              <>
                <DropdownMenuItem onSelect={togglePresenting}>
                  {presenting ? <MegaphoneOff /> : <Megaphone />}
                  {presenting ? 'Остановить показ' : 'Позвать всех за мной'}
                </DropdownMenuItem>
                {followers > 0 ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    За вами следят: {followers}{' '}
                    {plural(followers, ['человек', 'человека', 'человек'])}
                  </p>
                ) : null}
              </>
            ) : follow?.userId === u.id ? (
              <DropdownMenuItem onSelect={() => setFollow(null)}>
                <Eye /> Перестать следовать
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={() =>
                  setFollow({ userId: u.id, name: u.name, color: u.color, auto: false })
                }
              >
                <Eye /> Следовать за {u.name}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
      {hidden > 0 ? (
        <span className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium">
          +{hidden}
        </span>
      ) : null}
    </div>
  );
}
