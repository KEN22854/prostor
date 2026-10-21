'use client';

import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';

/** Число элементов на доске — для шапки и временного экрана до появления холста */
export function useElementCount(doc: Y.Doc | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!doc) return;
    const elements = doc.getMap<unknown>(Y_KEYS.elements);
    const update = () => setCount(elements.size);
    update();
    // observe (не observeDeep): нужен только состав ключей, не изменения полей
    elements.observe(update);
    return () => elements.unobserve(update);
  }, [doc]);

  return count;
}
