import { useEffect, useState } from 'react';

const NOTICE_DELAY_MS = 300;

export function useFirstLoadNotice(pending: boolean) {
  const [noticeVisible, setNoticeVisible] = useState(false);
  if (!pending && noticeVisible) setNoticeVisible(false);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setNoticeVisible(true), NOTICE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return pending && noticeVisible;
}
