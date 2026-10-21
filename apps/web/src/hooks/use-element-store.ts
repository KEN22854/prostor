'use client';

import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { Y_KEYS } from '@prostor/shared';
import { ElementStore } from '@/lib/canvas/element-store';

/** ElementStore для документа доски; пересоздаётся при смене документа */
export function useElementStore(doc: Y.Doc | null): ElementStore | null {
  const [store, setStore] = useState<ElementStore | null>(null);

  useEffect(() => {
    if (!doc) return;
    const created = new ElementStore(doc.getMap<unknown>(Y_KEYS.elements));
    setStore(created);
    return () => {
      created.destroy();
      setStore(null);
    };
  }, [doc]);

  return store;
}
