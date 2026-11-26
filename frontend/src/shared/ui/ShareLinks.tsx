import { Link2, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const shareButton =
  'pressable inline-flex min-h-12 min-w-0 flex-[1_1_7rem] items-center justify-center gap-2 rounded-control border px-3 py-2 text-center text-support font-semibold wrap-anywhere';
const quiet = 'neutral-control-gradient border-line bg-surface text-accent';
const copiedStyle = 'tonal-control-gradient border-success/25 bg-success-soft text-success';
const CONFIRMATION_MS = 2000;

type ShareLinksProps = {
  title: string;
  path: string;
};

type CopyResult = { copied: boolean };

/**
 * Share and Copy link for a public page. The link carries nothing about the visitor. Share opens
 * the phone's share sheet and appears only where the browser has one; Copy link always appears.
 */
export function ShareLinks({ title, path }: Readonly<ShareLinksProps>) {
  const [copyResult, setCopyResult] = useState<CopyResult>();
  const copying = useRef(false);
  const link = new URL(path, window.location.origin).href;
  const canShare = typeof navigator.share === 'function';
  const copied = copyResult?.copied === true;
  const failed = copyResult?.copied === false;

  useEffect(() => {
    if (!copyResult?.copied) return;
    const timer = window.setTimeout(() => setCopyResult(undefined), CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [copyResult]);

  async function copyLink() {
    if (copying.current) return;
    copying.current = true;
    try {
      await navigator.clipboard.writeText(link);
      setCopyResult({ copied: true });
    } catch {
      // The clipboard is missing outside HTTPS and can be blocked by the browser.
      setCopyResult({ copied: false });
    } finally {
      copying.current = false;
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
      <div className="flex flex-wrap gap-2 pt-2.5">
        {canShare && (
          <button type="button" onClick={() => void share()} className={`${shareButton} ${quiet}`}>
            <Share2 aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />
            Share
          </button>
        )}
        <button
          type="button"
          onClick={() => void copyLink()}
          aria-label={copied ? 'Copied. Copy link again' : undefined}
          className={`${shareButton} ${copied ? copiedStyle : quiet}`}
        >
          <Link2 aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <output className={failed ? 'mt-2 block wrap-anywhere text-support text-muted' : 'sr-only'}>
        {copyMessage(copyResult, link)}
      </output>
    </div>
  );
}

function copyMessage(result: CopyResult | undefined, link: string): string {
  if (!result) return '';
  if (result.copied) return 'Link copied.';
  return `Couldn't copy the link. Here it is: ${link}`;
}
