import { Trash2, TriangleAlert } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  destructiveOutlineButton,
  inlineConfirmationButton,
  neutralOutlineButton,
} from '../../../shared/ui/buttonStyles';

type Props = {
  title: string;
  removes: string;
  deleting: boolean;
  problem: ReactNode;
  onOpen: () => void;
  onDelete: () => void;
};

export function InlineDeckDelete({ title, removes, deleting, problem, onOpen, onDelete }: Readonly<Props>) {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const titleId = useId();
  const warningId = useId();

  useLayoutEffect(() => {
    if (confirming) {
      keep.current?.focus({ preventScroll: true });
      keep.current?.closest('section')?.scrollIntoView?.({ block: 'nearest' });
    } else if (returnFocus.current) {
      trigger.current?.focus();
      returnFocus.current = false;
    }
  }, [confirming]);

  function cancel() {
    returnFocus.current = true;
    setConfirming(false);
  }

  function cancelOnEscape(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (!deleting) cancel();
  }

  return (
    <section className="mt-7 border-t border-line pt-5" aria-labelledby={titleId}>
      <h3 id={titleId} className="text-label font-bold">
        {confirming ? 'Delete deck?' : 'Delete deck'}
      </h3>
      <p className="mt-1 text-support text-muted">
        {confirming ? (
          <>
            Permanently removes “{title}”, {removes}.
          </>
        ) : (
          <>Removes {removes}.</>
        )}
      </p>
      <p id={warningId} className="mt-2 flex items-center gap-1.5 text-support font-bold text-destructive">
        <TriangleAlert aria-hidden="true" className="size-[1.125em] shrink-0" />
        This can’t be undone.
      </p>
      {confirming ? (
        <form
          className="mt-3"
          aria-busy={deleting}
          onSubmit={(event) => {
            event.preventDefault();
            if (!deleting) onDelete();
          }}
        >
          {problem}
          <div className="flex flex-wrap gap-2">
            <button
              ref={keep}
              type="button"
              aria-describedby={warningId}
              className={`${neutralOutlineButton} ${inlineConfirmationButton}`}
              disabled={deleting}
              onClick={cancel}
              onKeyDown={cancelOnEscape}
            >
              Keep
            </button>
            <button
              type="submit"
              aria-describedby={warningId}
              className={`${destructiveOutlineButton} ${inlineConfirmationButton}`}
              disabled={deleting}
            >
              <Trash2 aria-hidden="true" className="size-[1.125em] shrink-0" />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={trigger}
          type="button"
          aria-describedby={warningId}
          className={`${destructiveOutlineButton} mt-3 w-full`}
          onClick={() => {
            onOpen();
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" className="size-[1.125em] shrink-0" />
          Delete
        </button>
      )}
    </section>
  );
}
