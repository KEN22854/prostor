'use client';

import { Folder, Home, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { hasRole, type BoardListItem, type FolderDto } from '@prostor/shared';
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
import { cn, errorMessage } from '@/lib/utils';

interface MoveBoardDialogProps {
  board: BoardListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Перенос доски в папку своего рабочего пространства (права доски наследуются от папки) */
export function MoveBoardDialog({ board, open, onOpenChange }: MoveBoardDialogProps) {
  const router = useRouter();
  const [folders, setFolders] = useState<FolderDto[] | null>(null);
  const [target, setTarget] = useState<string | null>(board.folderId);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget(board.folderId);
    const query = board.orgId ? `?org=${board.orgId}` : '';
    apiRequest<{ folders: FolderDto[] }>(`/api/folders${query}`)
      .then((d) => setFolders(d.folders.filter((f) => hasRole(f.role, 'EDITOR'))))
      .catch(() => setFolders([]));
  }, [open, board.orgId, board.folderId]);

  async function move() {
    setPending(true);
    try {
      await apiRequest(`/api/boards/${board.id}/folder`, {
        method: 'PATCH',
        body: { folderId: target },
      });
      toast.success('Доска перемещена');
      onOpenChange(false);
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось переместить доску'));
    } finally {
      setPending(false);
    }
  }

  const depth = (f: FolderDto) => f.path.split('/').filter(Boolean).length - 1;
  const sorted = [...(folders ?? [])].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Переместить «{board.title}»</DialogTitle>
          <DialogDescription>
            Участники папки получат доступ к доске по наследованию.
          </DialogDescription>
        </DialogHeader>
        <ul
          className="max-h-72 overflow-y-auto rounded-lg border p-1"
          role="listbox"
          aria-label="Папка назначения"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={target === null}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
                target === null && 'bg-accent',
              )}
              onClick={() => setTarget(null)}
            >
              <Home className="size-4" /> Без папки
            </button>
          </li>
          {folders === null ? (
            <li className="p-3 text-center">
              <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
            </li>
          ) : (
            sorted.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={target === f.id}
                  className={cn(
                    'flex w-full items-center gap-2 rounded py-1.5 pr-2 text-left text-sm hover:bg-muted',
                    target === f.id && 'bg-accent',
                  )}
                  style={{ paddingLeft: 8 + depth(f) * 14 }}
                  onClick={() => setTarget(f.id)}
                >
                  <Folder className="size-4 shrink-0" /> <span className="truncate">{f.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => void move()} disabled={pending || target === board.folderId}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Переместить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
