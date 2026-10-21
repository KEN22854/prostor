import { create } from 'zustand';
import type { Bounds } from '@prostor/shared';

export interface AiTask {
  key: string;
  label: string;
  /** 0..100 */
  progress: number;
  /** Над каким элементом показывать индикатор (рамка следует за элементом) */
  elementId?: string;
  /** Или фиксированная область доски (генерация: место будущей картинки) */
  bounds?: Bounds;
}

interface AiState {
  tasks: Record<string, AiTask>;
  start: (task: AiTask) => void;
  progress: (key: string, progress: number) => void;
  finish: (key: string) => void;
}

/** Выполняющиеся ИИ-задачи этого пользователя — для индикаторов поверх холста */
export const useAiStore = create<AiState>()((set) => ({
  tasks: {},
  start: (task) => set((s) => ({ tasks: { ...s.tasks, [task.key]: task } })),
  progress: (key, progress) =>
    set((s) => {
      const task = s.tasks[key];
      if (!task || task.progress === progress) return s;
      return { tasks: { ...s.tasks, [key]: { ...task, progress } } };
    }),
  finish: (key) =>
    set((s) => {
      if (!(key in s.tasks)) return s;
      const tasks = { ...s.tasks };
      delete tasks[key];
      return { tasks };
    }),
}));
