'use client';

import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

/** Доступность undo/redo для кнопок тулбара (Y.UndoManager не реактивен сам по себе) */
export function useUndoState(undoManager: Y.UndoManager | null): {
  canUndo: boolean;
  canRedo: boolean;
} {
  const [state, setState] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    if (!undoManager) return;
    const update = () =>
      setState({ canUndo: undoManager.canUndo(), canRedo: undoManager.canRedo() });
    update();
    undoManager.on('stack-item-added', update);
    undoManager.on('stack-item-popped', update);
    undoManager.on('stack-cleared', update);
    return () => {
      undoManager.off('stack-item-added', update);
      undoManager.off('stack-item-popped', update);
      undoManager.off('stack-cleared', update);
    };
  }, [undoManager]);

  return state;
}
