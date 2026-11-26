import type { ReactNode } from 'react';
import { useFirstLoadNotice } from './useFirstLoadNotice';

/** Shows a loading message only after a wait long enough to notice, so a quick load does not flash it. */
export function WhenSlow({ children }: Readonly<{ children: ReactNode }>) {
  return useFirstLoadNotice(true) ? children : null;
}
