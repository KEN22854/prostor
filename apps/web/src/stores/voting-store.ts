import { create } from 'zustand';
import type { VotingDto } from '@prostor/shared';
import { apiRequest } from '@/lib/fetcher';

interface VotingState {
  boardId: string | null;
  voting: VotingDto | null;
  set: (boardId: string, voting: VotingDto | null) => void;
  reset: () => void;
}

/** Голосование на доске (источник правды — сервер, обновление по событию voting-changed) */
export const useVotingStore = create<VotingState>()((set) => ({
  boardId: null,
  voting: null,
  set: (boardId, voting) => set({ boardId, voting }),
  reset: () => set({ boardId: null, voting: null }),
}));

export async function reloadVoting(boardId: string): Promise<void> {
  const { voting } = await apiRequest<{ voting: VotingDto | null }>(
    `/api/boards/${boardId}/voting`,
  );
  const current = useVotingStore.getState().boardId;
  if (current && current !== boardId) return;
  useVotingStore.getState().set(boardId, voting);
}

export async function startVoting(
  boardId: string,
  title: string,
  votesPerUser: number,
): Promise<void> {
  await apiRequest(`/api/boards/${boardId}/voting`, {
    method: 'POST',
    body: { title, votesPerUser },
  });
  await reloadVoting(boardId);
}

export async function castVote(
  boardId: string,
  sessionId: string,
  elementId: string,
): Promise<void> {
  await apiRequest(`/api/voting/${sessionId}/votes`, { method: 'POST', body: { elementId } });
  await reloadVoting(boardId);
}

export async function retractVote(
  boardId: string,
  sessionId: string,
  elementId: string,
): Promise<void> {
  await apiRequest(`/api/voting/${sessionId}/votes`, { method: 'DELETE', body: { elementId } });
  await reloadVoting(boardId);
}

export async function endVoting(boardId: string, sessionId: string): Promise<void> {
  await apiRequest(`/api/voting/${sessionId}/end`, { method: 'POST' });
  await reloadVoting(boardId);
}

export async function closeVoting(boardId: string, sessionId: string): Promise<void> {
  await apiRequest(`/api/voting/${sessionId}/close`, { method: 'POST' });
  await reloadVoting(boardId);
}
