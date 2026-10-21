'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { BoardListItem } from '@prostor/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

interface DeleteBoardDialogProps {
  board: BoardListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteBoardDialog({ board, open, onOpenChange }: DeleteBoardDialogProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await apiRequest(`/api/boards/${board.id}`, { method: 'DELETE' });
      toast.success(`Доска «${board.title}» удалена`);
      onOpenChange(false);
      router.refresh();
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Не удалось удалить доску'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить доску?</DialogTitle>
          <DialogDescription>
            «{board.title}» исчезнет у всех участников. Подключённые пользователи будут отключены.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
