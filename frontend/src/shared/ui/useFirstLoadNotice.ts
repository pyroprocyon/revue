import { useLayoutEffect, useRef, useState } from 'react';

const NOTICE_DELAY_MS = 500;
const NOTICE_MINIMUM_MS = 200;

export function useFirstLoadNotice(pending: boolean) {
  const [noticeVisible, setNoticeVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useLayoutEffect(() => {
    const visibleSince = shownAt.current;
    if (pending === (visibleSince !== null)) return;

    const delay =
      visibleSince === null ? NOTICE_DELAY_MS : Math.max(0, NOTICE_MINIMUM_MS - (performance.now() - visibleSince));
    const timer = window.setTimeout(() => {
      shownAt.current = pending ? performance.now() : null;
      setNoticeVisible(pending);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return noticeVisible;
}
