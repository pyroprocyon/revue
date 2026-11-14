import { useEffect, useState, type ReactNode } from 'react';

const NOTICEABLE_WAIT_MS = 300;

/** Shows a loading message only after a wait long enough to notice, so a quick load does not flash it. */
export function WhenSlow({ children }: Readonly<{ children: ReactNode }>) {
  const [waitIsNoticeable, setWaitIsNoticeable] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaitIsNoticeable(true), NOTICEABLE_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  return waitIsNoticeable ? children : null;
}
