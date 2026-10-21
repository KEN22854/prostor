'use client';

import { Globe, Link2, Loader2, Mail, Users } from 'lucide-react';
import { EmailInviteForm } from '@/components/sharing/email-invite-form';
import { InviteLinks } from '@/components/sharing/invite-links';
import { MembersList } from '@/components/sharing/members-list';
import { VisibilitySettings } from '@/components/sharing/visibility-settings';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSharingState } from '@/hooks/use-sharing-state';
import { useT } from '@/lib/i18n/client';

interface SharingPanelProps {
  boardId: string;
  /** Загружать данные (в диалоге — только когда он открыт) */
  enabled?: boolean;
  defaultTab?: 'invite' | 'members' | 'links' | 'access';
}

/**
 * Управление доступом: приглашения, участники, ссылки, видимость.
 * Используется в ShareDialog и на странице настроек доски.
 */
export function SharingPanel({
  boardId,
  enabled = true,
  defaultTab = 'invite',
}: SharingPanelProps) {
  const t = useT();
  const { state, error, refresh } = useSharingState(boardId, enabled);

  if (error) {
    return (
      <div className="space-y-2 py-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          {t('Повторить')}
        </Button>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label={t('Загрузка')} />
      </div>
    );
  }

  const canShare = state.grantableRoles.length > 0;
  const tab =
    !canShare && (defaultTab === 'invite' || defaultTab === 'links') ? 'members' : defaultTab;

  return (
    <Tabs defaultValue={tab}>
      <TabsList className="w-full justify-start overflow-x-auto">
        {canShare ? (
          <TabsTrigger value="invite">
            <Mail /> {t('Пригласить')}
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="members">
          <Users /> {t('Участники')}{' '}
          <span className="text-xs opacity-70">{state.members.length}</span>
        </TabsTrigger>
        {canShare ? (
          <TabsTrigger value="links">
            <Link2 /> {t('Ссылки')}
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="access">
          <Globe /> {t('Доступ')}
        </TabsTrigger>
      </TabsList>
      {canShare ? (
        <TabsContent value="invite">
          <EmailInviteForm state={state} onChanged={refresh} />
        </TabsContent>
      ) : null}
      <TabsContent value="members">
        <MembersList state={state} onChanged={refresh} />
      </TabsContent>
      {canShare ? (
        <TabsContent value="links">
          <InviteLinks state={state} onChanged={refresh} />
        </TabsContent>
      ) : null}
      <TabsContent value="access">
        <VisibilitySettings state={state} onChanged={refresh} />
      </TabsContent>
    </Tabs>
  );
}
