import type { ReactNode } from 'react';

/**
 * template (в отличие от layout) монтируется заново при каждом переходе —
 * так каждая страница мягко «проявляется». В конце анимации transform: none,
 * чтобы обёртка не становилась контейнером для fixed-элементов.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
