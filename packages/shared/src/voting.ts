import { z } from 'zod';

export const startVotingSchema = z.object({
  title: z.string().trim().min(1, 'Назовите голосование').max(200),
  votesPerUser: z.number().int().min(1).max(20).default(3),
});
export type StartVotingInput = z.input<typeof startVotingSchema>;

export const castVoteSchema = z.object({ elementId: z.string().min(1).max(64) });

export interface VoteResultDto {
  elementId: string;
  count: number;
}

export interface VotingDto {
  id: string;
  title: string;
  votesPerUser: number;
  status: 'active' | 'ended';
  createdByName: string;
  /** Завершить, скрыть результаты — ведущий или редактор */
  canManage: boolean;
  /** Голосовать может читатель и выше (и гость, если позволяет организация) */
  canVote: boolean;
  /** Мои голоса: elementId → сколько отдал */
  myVotes: Record<string, number>;
  myRemaining: number;
  totalVotes: number;
  voters: number;
  /**
   * Итоги по объектам (по убыванию). Пока голосование идёт — null:
   * чужие голоса скрыты, чтобы не подталкивать к «голосованию за лидера».
   */
  results: VoteResultDto[] | null;
}
