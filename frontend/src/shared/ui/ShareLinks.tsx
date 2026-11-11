import { Link2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { secondaryButton } from './buttonStyles';

const shareButton = `${secondaryButton} lg:min-h-14 lg:border lg:border-line lg:bg-transparent lg:px-4 lg:shadow-none`;

type ShareLinksProps = {
  title: string;
  path: string;
};

type CopyResult = 'not-copied' | 'copied' | 'failed';

/**
 * Share and Copy link for a public page. The link carries nothing about the visitor. Share opens
 * the phone's share sheet and appears only where the browser has one; Copy link always appears.
 */
export function ShareLinks({ title, path }: ShareLinksProps) {
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9rem,100%),1fr))] gap-3 sm:flex sm:flex-wrap">
        {canShare && (
          <button type="button" onClick={share} className={shareButton}>
            <Share2 aria-hidden="true" size={20} strokeWidth={2} />
            Share
          </button>
        )}
        <button type="button" onClick={copyLink} className={shareButton}>
          <Link2 aria-hidden="true" size={20} strokeWidth={2} />
          Copy link
        </button>
      </div>
      <p role="status" className="mt-2 wrap-anywhere text-support text-muted">
        {copyMessage(copyResult, link)}
      </p>
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
