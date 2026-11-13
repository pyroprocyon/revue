import { Link2, Share2 } from 'lucide-react';
import { useState } from 'react';

const shareButton = 'pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-3 py-2 text-support font-semibold text-accent';

type ShareLinksProps = {
  title: string;
  path: string;
};

type CopyResult = 'not-copied' | 'copied' | 'failed';

/**
 * Share and Copy link for a public page. The link carries nothing about the visitor. Share opens
 * the phone's share sheet and appears only where the browser has one; Copy link always appears.
 */
export function ShareLinks({ title, path }: Readonly<ShareLinksProps>) {
  const [copyResult, setCopyResult] = useState<CopyResult>('not-copied');
  const link = new URL(path, window.location.origin).href;
  const canShare = typeof navigator.share === 'function';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopyResult('copied');
    } catch {
      // The clipboard is missing outside HTTPS and can be blocked by the browser.
      setCopyResult('failed');
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url: link });
    } catch {
      // Closing the share sheet also rejects. Nothing to report: Copy link is still there.
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {canShare && (
          <button type="button" onClick={share} className={shareButton}>
            <Share2 aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />
            Share
          </button>
        )}
        <button type="button" onClick={copyLink} className={shareButton}>
          <Link2 aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />
          Copy link
        </button>
      </div>
      <output className="mt-2 block wrap-anywhere px-3 text-support text-muted empty:mt-0">
        {copyMessage(copyResult, link)}
      </output>
    </div>
  );
}

function copyMessage(result: CopyResult, link: string): string {
  if (result === 'copied') {
    return 'Link copied.';
  }
  if (result === 'failed') {
    return `Couldn't copy the link. Here it is: ${link}`;
  }
  return '';
}
