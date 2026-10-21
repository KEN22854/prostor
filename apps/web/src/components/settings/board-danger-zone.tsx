'use client';

import { Loader2, LogOut, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

interface BoardDangerZoneProps {
  boardId: string;
  title: string;
  userId: string;
  isOwner: boolean;
  /** Участник с явным членством (доступ через папку/организацию «покинуть» нельзя) */
  isMember: boolean;
}

/** Владелец удаляет доску (с подтверждением названием), участник — покидает её */
export function BoardDangerZone({ boardId, title, userId, isOwner, isMember }: BoardDangerZoneProps) {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);

  async function run(url: string, done: string) {
    setPending(true);
    try {
      await apiRequest(url, { method: 'DELETE' });
      toast.success(done);
      router.push('/dashboard');
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось выполнить действие'));
      setPending(false);
    }
  }

  if (isOwner) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Доска переместится в корзину и исчезнет у всех участников. Чтобы подтвердить, введите её название.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete">Название доски</Label>
          <Input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={title} />
        </div>
        <Button
          variant="destructive"
          disabled={pending || confirm.trim() !== title.trim()}
          onClick={() => void run(`/api/boards/${boardId}`, `Доска «${title}» удалена`)}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Удалить доску
        </Button>
      </div>
    );
  }

  if (!isMember) {
    return <p className="text-sm text-muted-foreground">Доступ выдан через папку или организацию — покинуть доску отдельно нельзя.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Вы потеряете доступ. Вернуться можно будет только по новому приглашению.</p>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (window.confirm('Покинуть доску?')) void run(`/api/boards/${boardId}/members/${userId}`, 'Вы покинули доску');
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <LogOut />}
        Покинуть доску
      </Button>
    </div>
  );
}
