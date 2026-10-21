import type { CommentThreadDto, CreateCommentInput } from '@prostor/shared';
import { apiRequest } from '@/lib/fetcher';
import { useCommentsStore } from '@/stores/comments-store';

/** Перечитать треды доски (после своих изменений и по событию comments-changed) */
export async function reloadComments(boardId: string): Promise<void> {
  const { threads } = await apiRequest<{ threads: CommentThreadDto[] }>(`/api/boards/${boardId}/comments`);
  // Пользователь мог уйти на другую доску, пока шёл запрос
  if (useCommentsStore.getState().boardId && useCommentsStore.getState().boardId !== boardId) return;
  useCommentsStore.getState().setThreads(boardId, threads);
}

export async function postComment(boardId: string, input: CreateCommentInput): Promise<{ id: string; threadId: string }> {
  const result = await apiRequest<{ id: string; threadId: string }>(`/api/boards/${boardId}/comments`, {
    method: 'POST',
    body: input,
  });
  await reloadComments(boardId);
  return result;
}

export async function editComment(boardId: string, commentId: string, body: string): Promise<void> {
  await apiRequest(`/api/comments/${commentId}`, { method: 'PATCH', body: { body } });
  await reloadComments(boardId);
}

export async function removeComment(boardId: string, commentId: string): Promise<void> {
  await apiRequest(`/api/comments/${commentId}`, { method: 'DELETE' });
  await reloadComments(boardId);
}

export async function setResolved(boardId: string, threadId: string, resolved: boolean): Promise<void> {
  await apiRequest(`/api/comments/${threadId}/resolve`, { method: 'POST', body: { resolved } });
  await reloadComments(boardId);
}

export async function toggleReaction(boardId: string, commentId: string, emoji: string): Promise<void> {
  await apiRequest(`/api/comments/${commentId}/reactions`, { method: 'POST', body: { emoji } });
  await reloadComments(boardId);
}

/** Уведомления по треду прочитаны (человек его открыл) */
export function markThreadRead(threadId: string): void {
  void apiRequest('/api/notifications/read', { method: 'POST', body: { threadId } }).catch(() => undefined);
}
