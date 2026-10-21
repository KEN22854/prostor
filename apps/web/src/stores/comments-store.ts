import { create } from 'zustand';
import type { CommentThreadDto } from '@prostor/shared';

/** Новый тред до отправки: точка холста или объект */
export interface CommentDraft {
  x: number;
  y: number;
  elementId?: string;
}

interface CommentsState {
  boardId: string | null;
  threads: CommentThreadDto[];
  loaded: boolean;
  /** Пины на холсте (Shift+C) */
  visible: boolean;
  showResolved: boolean;
  openThreadId: string | null;
  draft: CommentDraft | null;

  setThreads: (boardId: string, threads: CommentThreadDto[]) => void;
  setVisible: (visible: boolean) => void;
  setShowResolved: (show: boolean) => void;
  openThread: (id: string | null) => void;
  startDraft: (draft: CommentDraft | null) => void;
  reset: () => void;
}

/**
 * Комментарии доски на клиенте. Источник правды — сервер: после любого
 * изменения (своего или пришедшего событием comments-changed) список
 * перечитывается целиком — тредов на доске десятки, это дешевле сложного merge.
 */
export const useCommentsStore = create<CommentsState>()((set) => ({
  boardId: null,
  threads: [],
  loaded: false,
  visible: true,
  showResolved: false,
  openThreadId: null,
  draft: null,

  setThreads: (boardId, threads) => set({ boardId, threads, loaded: true }),
  setVisible: (visible) =>
    set(visible ? { visible } : { visible, openThreadId: null, draft: null }),
  setShowResolved: (showResolved) => set({ showResolved }),
  openThread: (openThreadId) => set({ openThreadId, draft: null }),
  startDraft: (draft) => set({ draft, openThreadId: null, visible: true }),
  reset: () =>
    set({
      boardId: null,
      threads: [],
      loaded: false,
      openThreadId: null,
      draft: null,
      showResolved: false,
      visible: true,
    }),
}));
