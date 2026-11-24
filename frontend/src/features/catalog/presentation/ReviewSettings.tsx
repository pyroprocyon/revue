import { Pause, Play } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  collection: 'deck' | 'reviewer';
  paused: boolean;
  onToggle: () => void;
  busy?: boolean;
  children?: ReactNode;
};

export function ReviewSettings({ collection, paused, onToggle, busy = false, children }: Readonly<Props>) {
  const Icon = paused ? Play : Pause;
  return (
    <section className="mt-7 border-t border-line pt-5" aria-busy={busy}>
      <h3 className="text-label font-bold">Reviews</h3>
      <p className="mt-1 text-support text-muted" aria-live="polite">
        {paused
          ? 'Paused. Your cards and study progress are kept. Resuming uses your saved schedule, so overdue cards are ready to review.'
          : `Pausing keeps this ${collection} out of Today. Your cards and study progress stay in Library.`}
      </p>
      <button
        type="button"
        aria-label={paused ? 'Resume reviews' : 'Pause reviews'}
        aria-disabled={busy || undefined}
        className="pressable mt-3 inline-flex min-h-12 items-center gap-2 rounded-control border border-line px-4 text-label font-semibold aria-disabled:text-muted"
        onClick={() => {
          if (!busy) onToggle();
        }}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {paused ? 'Resume' : 'Pause'}
      </button>
      {children}
    </section>
  );
}
