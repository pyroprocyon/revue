import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ReviewCounts, ReviewGroup } from '../application/library';

const labels: Record<ReviewGroup, string> = { active: 'Active', paused: 'Paused' };

type Props = {
  group: ReviewGroup;
  counts?: ReviewCounts;
  onChoose: (group: ReviewGroup) => void;
  saved?: boolean;
  children: ReactNode;
};

export function CollectionStatusMenu({ group, counts, onChoose, saved = false, children }: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<HTMLFieldSetElement>(null);
  const menu = useId();
  const accent = saved ? 'bg-saved-set-soft text-saved-set' : 'bg-accent-soft text-accent-strong';

  useLayoutEffect(() => {
    if (open) options.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: Event) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function escape(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-x-2">
      {children && <div className="min-w-0 flex-1 basis-[min(10rem,100%)]">{children}</div>}
      <div ref={container} className={`relative mb-3 max-w-full ${children ? 'ms-auto' : ''}`}>
        <button
          ref={trigger}
          type="button"
          data-collection-status=""
          aria-label={`Review status: ${labels[group]}`}
          aria-expanded={open}
          aria-controls={menu}
          onClick={() => setOpen(!open)}
          onKeyDown={escape}
          className={`pressable inline-flex min-h-12 max-w-full items-center gap-1.5 rounded-control px-3 py-2 text-label font-bold wrap-anywhere ${accent}`}
        >
          {labels[group]}
          <ChevronDown aria-hidden="true" className="size-[1em] shrink-0" />
        </button>
        <fieldset
          ref={options}
          id={menu}
          hidden={!open}
          className={`absolute top-full z-30 mt-1 min-w-[min(9rem,calc(100vw_-_2rem))] rounded-control border border-line bg-surface p-1 shadow-card ${children ? 'end-0' : 'start-0'}`}
        >
          <legend className="sr-only">{saved ? 'Show saved reviewers' : 'Show decks'}</legend>
          {(['active', 'paused'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-label={counts && `${labels[option]} ${counts[option]}`}
              aria-pressed={group === option}
              onClick={() => {
                close();
                onChoose(option);
              }}
              onKeyDown={escape}
              className={`pressable flex min-h-12 w-full items-center gap-1.5 rounded-inset px-2 text-label font-semibold ${group === option ? accent : 'text-ink'}`}
            >
              {group === option && <Check aria-hidden="true" className="size-[1em] shrink-0" />}
              <span className="min-w-0 flex-1 text-start wrap-anywhere">{labels[option]}</span>
              {counts && <span className="tabular-nums">{counts[option]}</span>}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
