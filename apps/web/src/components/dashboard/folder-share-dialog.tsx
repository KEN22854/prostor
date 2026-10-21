'use client';

import { Loader2, UserMinus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ROLE_LABELS, type AssignableRole, type FolderMemberDto } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

interface FolderShareDialogProps {
  folderId: string;
  folderName: string;
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Доступ к папке: права получают все доски внутри, включая вложенные папки */
export function FolderShareDialog({
  folderId,
  folderName,
  canManage,
  open,
  onOpenChange,
}: FolderShareDialogProps) {
  const t = useT();
  const [members, setMembers] = useState<FolderMemberDto[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('EDITOR');
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<{ members: FolderMemberDto[] }>(
        `/api/folders/${folderId}/members`,
      );
      setMembers(data.members);
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось загрузить участников')));
    }
  }, [folderId, t]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function add() {
    if (!email.trim()) return;
    setPending(true);
    try {
      await apiRequest(`/api/folders/${folderId}/members`, {
        method: 'POST',
        body: { email: email.trim(), role },
      });
      setEmail('');
      toast.success(t('Доступ открыт'));
      await load();
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось открыть доступ')));
    } finally {
      setPending(false);
    }
  }

  async function remove(userId: string) {
    try {
      await apiRequest(`/api/folders/${folderId}/members/${userId}`, { method: 'DELETE' });
      await load();
    } catch (e: unknown) {
      toast.error(errorMessage(e, t('Не удалось закрыть доступ')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Доступ к папке «{folderName}»</DialogTitle>
          <DialogDescription>
            {t('Права действуют на все доски папки и вложенных папок.')}
          </DialogDescription>
        </DialogHeader>
        {canManage ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Input
              type="email"
              placeholder="colleague@company.ru"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="w-36 shrink-0">
              <NativeSelect
                aria-label={t('Роль')}
                value={role}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
              >
                <option value="EDITOR">{ROLE_LABELS.EDITOR}</option>
                <option value="VIEWER">{ROLE_LABELS.VIEWER}</option>
                <option value="GUEST">{ROLE_LABELS.GUEST}</option>
              </NativeSelect>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {t('Открыть')}
            </Button>
          </form>
        ) : null}
        <ul
          className="max-h-72 divide-y overflow-y-auto rounded-lg border"
          aria-label={t('Участники папки')}
        >
          {members === null ? (
            <li className="p-4 text-center">
              <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
            </li>
          ) : members.length === 0 ? (
            <li className="p-4 text-center text-sm text-muted-foreground">
              {t('Папка доступна только владельцу')}
            </li>
          ) : (
            members.map((m) => (
              <li
                key={`${m.userId}-${m.inheritedFrom ?? ''}`}
                className="flex items-center gap-3 p-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name ?? m.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email}
                    {m.inheritedFrom ? ` · из папки «${m.inheritedFrom}»` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {ROLE_LABELS[m.role]}
                </span>
                {canManage && !m.inheritedFrom ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Закрыть доступ ${m.email}`}
                    onClick={() => void remove(m.userId)}
                  >
                    <UserMinus />
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
