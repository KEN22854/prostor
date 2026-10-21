'use client';

import { Copy, ExternalLink, FolderInput, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { can, type BoardListItem } from '@prostor/shared';
import { DeleteBoardDialog } from '@/components/dashboard/delete-board-dialog';
import { MoveBoardDialog } from '@/components/dashboard/move-board-dialog';
import { RenameBoardDialog } from '@/components/dashboard/rename-board-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiRequest } from '@/lib/fetcher';
import { errorMessage } from '@/lib/utils';

export function BoardCardMenu({ board }: { board: BoardListItem }) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  async function duplicate() {
    const toastId = toast.loading('Копируем доску…');
    try {
      await apiRequest<{ id: string }>(`/api/boards/${board.id}/duplicate`, { method: 'POST' });
      toast.success('Копия создана', { id: toastId });
      router.refresh();
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Не удалось скопировать доску'), { id: toastId });
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Действия с «${board.title}»`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => window.open(`/board/${board.id}`, '_blank', 'noopener')}
          >
            <ExternalLink /> Открыть в новой вкладке
          </DropdownMenuItem>
          {can(board.role, 'edit') ? (
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <Pencil /> Переименовать
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void duplicate()}>
            <Copy /> Дублировать
          </DropdownMenuItem>
          {board.isOwner ? (
            <DropdownMenuItem onSelect={() => setMoveOpen(true)}>
              <FolderInput /> Переместить в папку
            </DropdownMenuItem>
          ) : null}
          {board.isOwner ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                <Trash2 /> Удалить
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameBoardDialog board={board} open={renameOpen} onOpenChange={setRenameOpen} />
      <DeleteBoardDialog board={board} open={deleteOpen} onOpenChange={setDeleteOpen} />
      {board.isOwner ? (
        <MoveBoardDialog board={board} open={moveOpen} onOpenChange={setMoveOpen} />
      ) : null}
    </>
  );
}
