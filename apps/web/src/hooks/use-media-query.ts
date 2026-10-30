'use client';

import { useSyncExternalStore } from 'react';

/** Совпадает ли медиазапрос (на сервере — false) */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Телефон: узкий экран — компактная нижняя панель инструментов */
export const COMPACT_QUERY = '(max-width: 639px)';
