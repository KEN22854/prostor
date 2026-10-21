'use client';

import { ArrowLeft, Download, History, Lock, MessageSquare, Redo2, Undo2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { can, type AiCapabilities, type BoardRole } from '@prostor/shared';
import { BoardTimerControl } from '@/components/board/board-timer';
import { ConnectionStatusIndicator } from '@/components/board/connection-status';
import { PresenceAvatars } from '@/components/board/presence-avatars';
import { ShareDialog } from '@/components/board/share-dialog';
import { CommentsPanel } from '@/components/comments/comments-panel';
import { NotificationsBell } from '@/components/notifications/notifications-bell';
import { StartVotingButton } from '@/components/voting/start-voting-button';
import { VersionHistoryPanel } from '@/components/board/version-history-panel';
import { VersionPreviewBar } from '@/components/board/version-preview-bar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCommentsSync } from '@/hooks/use-comments-sync';
import { useElementCount } from '@/hooks/use-element-count';
import { usePresence } from '@/hooks/use-presence';
import { useUndoState } from '@/hooks/use-undo-state';
import { useVersionHistory } from '@/hooks/use-version-history';
import { useVotingSync } from '@/hooks/use-voting-sync';
import { useYjs } from '@/hooks/use-yjs';
import { plural } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvas-store';
import { useCommentsStore } from '@/stores/comments-store';

// Konva работает только в браузере, а это самая тяжёлая часть страницы —
// отдельный чанк, загружается после шапки.
const BoardCanvas = dynamic(
  () => import('@/components/canvas/board-canvas').then((m) => m.BoardCanvas),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-canvas" />,
  },
);

const DevPerfPanel =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('@/components/canvas/dev-perf-panel').then((m) => m.DevPerfPanel), {
        ssr: false,
      })
    : null;

interface BoardRoomProps {
  boardId: string;
  title: string;
  /** Роль по данным сервера на момент рендера; актуальная приходит из WS-токена */
  initialRole: BoardRole;
  isAuthenticated: boolean;
  /** ИИ-функции, включённые на сервере */
  ai: AiCapabilities;
}

/** Комната доски: шапка (статус, присутствие, undo/redo) + холст */
export function BoardRoom({ boardId, title, initialRole, isAuthenticated, ai }: BoardRoomProps) {
  const { connection, status, hasPendingChanges, localReady, role, policy, user, error } =
    useYjs(boardId);
  const awareness = connection?.provider?.awareness ?? null;
  const presence = usePresence(awareness);
  const count = useElementCount(connection?.doc ?? null);
  const { canUndo, canRedo } = useUndoState(connection?.undoManager ?? null);

  const effectiveRole = role ?? initialRole;
  const canEdit = can(effectiveRole, 'edit');
  const history = useVersionHistory(boardId, connection);
  useCommentsSync(boardId, connection);
  useVotingSync(boardId, connection);
  const openComments = useCommentsStore((s) => s.threads.filter((t) => !t.resolvedAt).length);
  const preview = history.preview;

  if (error) return <BoardAccessError error={error} />;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col">
        <header className="z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3">
          <Button asChild variant="ghost" size="icon" aria-label="К списку досок">
            <Link href={isAuthenticated ? '/dashboard' : '/'}>
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="min-w-0 truncate font-medium">{title}</h1>
          {!canEdit ? (
            <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden /> Только просмотр
            </span>
          ) : null}
          <ConnectionStatusIndicator
            status={status}
            hasPendingChanges={hasPendingChanges}
            localReady={localReady}
          />
          <span
            className="hidden text-xs text-muted-foreground sm:inline"
            data-testid="element-count"
          >
            {count.toLocaleString('ru')} {plural(count, ['объект', 'объекта', 'объектов'])}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {canEdit && isAuthenticated && !preview ? <StartVotingButton boardId={boardId} /> : null}
            <BoardTimerControl
              doc={connection?.doc ?? null}
              canControl={canEdit && !preview}
              userName={user?.name ?? ''}
            />
            {canEdit ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Отменить"
                      disabled={!canUndo}
                      onClick={() => connection?.undoManager.undo()}
                    >
                      <Undo2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Отменить <kbd className="ml-1 opacity-70">Ctrl+Z</kbd>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Повторить"
                      disabled={!canRedo}
                      onClick={() => connection?.undoManager.redo()}
                    >
                      <Redo2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Повторить <kbd className="ml-1 opacity-70">Ctrl+Shift+Z</kbd>
                  </TooltipContent>
                </Tooltip>
              </>
            ) : null}
            {can(effectiveRole, 'export', policy) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Экспорт"
                    onClick={() => useCanvasStore.getState().setPanel('export')}
                  >
                    <Download />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Экспорт PNG / PDF / SVG <kbd className="ml-1 opacity-70">Ctrl+Shift+E</kbd>
                </TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  aria-label="Обсуждения"
                  onClick={() => {
                    const s = useCanvasStore.getState();
                    s.setPanel(s.panel === 'comments' ? null : 'comments');
                  }}
                >
                  <MessageSquare />
                  {openComments > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                      {openComments}
                    </span>
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Обсуждения</TooltipContent>
            </Tooltip>
            {canEdit && isAuthenticated ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="История версий"
                    onClick={() => {
                      const s = useCanvasStore.getState();
                      s.setPanel(s.panel === 'history' ? null : 'history');
                    }}
                  >
                    <History />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>История версий</TooltipContent>
              </Tooltip>
            ) : null}
            <PresenceAvatars users={presence} awareness={preview ? null : awareness} />
            {isAuthenticated ? <NotificationsBell /> : null}
            {isAuthenticated ? <ShareDialog boardId={boardId} title={title} /> : null}
          </div>
        </header>

        <main className="relative min-h-0 flex-1">
          <BoardCanvas
            boardId={boardId}
            title={title}
            isAuthenticated={isAuthenticated}
            // Просмотр версии: тот же холст, но документ версии и только чтение
            doc={preview?.doc ?? connection?.doc ?? null}
            awareness={preview ? null : awareness}
            undoManager={preview ? null : (connection?.undoManager ?? null)}
            role={preview ? 'VIEWER' : effectiveRole}
            policy={policy}
            user={user ? { id: user.id, name: user.name } : null}
            // «Показать всё» при первом открытии: после синхронизации с сервером
            // или, офлайн, когда в локальной копии уже есть объекты. Пустая
            // IndexedDB новой доски — ещё не повод выставлять камеру.
            contentReady={Boolean(preview) || status === 'synced' || (localReady && count > 0)}
            ai={ai}
          />
          {preview ? (
            <VersionPreviewBar
              version={preview.version}
              canRestore={canEdit}
              onRestore={history.restore}
              onClose={history.close}
            />
          ) : null}
          <CommentsPanel />
          {canEdit && isAuthenticated ? (
            <VersionHistoryPanel
              boardId={boardId}
              activeId={preview?.version.id ?? null}
              onPreview={(v) => void history.open(v)}
              onSave={history.save}
              refreshKey={history.refreshKey}
            />
          ) : null}
          {DevPerfPanel && connection && user && canEdit ? (
            <DevPerfPanel connection={connection} userId={user.id} />
          ) : null}
        </main>
      </div>
    </TooltipProvider>
  );
}

function BoardAccessError({ error }: { error: 'forbidden' | 'not_found' | 'unauthorized' }) {
  const text = {
    forbidden: 'У вас больше нет доступа к этой доске.',
    not_found: 'Доска удалена или не существует.',
    unauthorized: 'Сессия истекла. Войдите снова.',
  }[error];
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-medium">{text}</p>
      <Button asChild>
        <Link href={error === 'unauthorized' ? '/login' : '/dashboard'}>
          {error === 'unauthorized' ? 'Войти' : 'К списку досок'}
        </Link>
      </Button>
    </main>
  );
}
