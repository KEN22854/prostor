'use client';

import { ChevronRight, Folder, FolderOpen, MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { hasRole, type FolderDto } from '@prostor/shared';
import { FolderShareDialog } from '@/components/dashboard/folder-share-dialog';
import { Button } from '@/components/ui/button';
import { usePrompt } from '@/components/ui/prompt-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiRequest } from '@/lib/fetcher';
import { cn, errorMessage } from '@/lib/utils';

interface TreeNode extends FolderDto {
  children: TreeNode[];
}

export function buildTree(folders: readonly FolderDto[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    // Родитель не виден (папку открыли без родителя) — показываем в корне
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

interface FolderTreeProps {
  folders: FolderDto[];
  activeId: string | null;
  /** Параметры ссылки рабочего пространства (?org=…) */
  baseQuery: string;
}

/** Дерево папок рабочего пространства в боковой панели дашборда */
export function FolderTree({ folders, activeId, baseQuery }: FolderTreeProps) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  // Раскрыты предки активной папки
  const activePath = folders.find((f) => f.id === activeId)?.path ?? '';
  if (tree.length === 0) return <p className="px-2 py-1 text-xs text-muted-foreground">Папок пока нет</p>;
  return (
    <ul className="space-y-0.5" role="tree" aria-label="Папки">
      {tree.map((node) => (
        <FolderItem key={node.id} node={node} depth={0} activeId={activeId} activePath={activePath} baseQuery={baseQuery} />
      ))}
    </ul>
  );
}

interface FolderItemProps {
  node: TreeNode;
  depth: number;
  activeId: string | null;
  activePath: string;
  baseQuery: string;
}

function FolderItem({ node, depth, activeId, activePath, baseQuery }: FolderItemProps) {
  const router = useRouter();
  const [open, setOpen] = useState(activePath.includes(`/${node.id}/`));
  const [shareOpen, setShareOpen] = useState(false);
  const [dialog, ask] = usePrompt();
  const active = node.id === activeId;
  const href = `/dashboard?${baseQuery}${baseQuery ? '&' : ''}folder=${node.id}`;
  const canEdit = hasRole(node.role, 'EDITOR');
  const isOwner = node.role === 'OWNER';

  async function rename() {
    const name = await ask({ title: 'Переименовать папку', label: 'Название папки', initial: node.name });
    if (!name || name === node.name) return;
    try {
      await apiRequest(`/api/folders/${node.id}`, { method: 'PATCH', body: { name } });
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось переименовать'));
    }
  }

  async function remove() {
    if (!window.confirm(`Удалить папку «${node.name}» и вложенные папки? Доски не удалятся — переедут в корень.`)) return;
    try {
      await apiRequest(`/api/folders/${node.id}`, { method: 'DELETE' });
      toast.success('Папка удалена');
      router.push(`/dashboard${baseQuery ? `?${baseQuery}` : ''}`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, 'Не удалось удалить папку'));
    }
  }

  return (
    <li role="treeitem" aria-expanded={node.children.length > 0 ? open : undefined} aria-selected={active}>
      <div
        className={cn('group flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-muted', active && 'bg-accent font-medium text-accent-foreground')}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <button
          type="button"
          className={cn('rounded p-0.5 text-muted-foreground', node.children.length === 0 && 'invisible')}
          aria-label={open ? 'Свернуть' : 'Развернуть'}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        </button>
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-1.5 py-1">
          {active || open ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />}
          <span className="truncate">{node.name}</span>
          {node.boardCount > 0 ? <span className="ml-auto text-xs text-muted-foreground">{node.boardCount}</span> : null}
        </Link>
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Действия с папкой «${node.name}»`}>
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => void rename()}>
                <Pencil /> Переименовать
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShareOpen(true)}>
                <Users /> Доступ к папке
              </DropdownMenuItem>
              {isOwner ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => void remove()}>
                    <Trash2 /> Удалить
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {open && node.children.length > 0 ? (
        <ul role="group">
          {node.children.map((child) => (
            <FolderItem key={child.id} node={child} depth={depth + 1} activeId={activeId} activePath={activePath} baseQuery={baseQuery} />
          ))}
        </ul>
      ) : null}
      {dialog}
      <FolderShareDialog folderId={node.id} folderName={node.name} canManage={isOwner} open={shareOpen} onOpenChange={setShareOpen} />
    </li>
  );
}
