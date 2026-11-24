import { Trash2, TriangleAlert } from 'lucide-react';
import { useContext, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';
import { destructiveOutlineButton, neutralOutlineButton } from '../../../shared/ui/buttonStyles';
import { DeckWriteProblem } from './DeckWriteProblem';
import type { DeckWriteState } from './useDecks';

type Props = {
  questionId: string;
  writeState: DeckWriteState;
  onOpen: () => void;
  onDelete: (confirmation: HTMLFormElement) => void;
};

const scrollMargin = 'scroll-mb-[max(1rem,env(safe-area-inset-bottom))]';
const confirmationButton = `${scrollMargin} aria-disabled:cursor-wait aria-disabled:opacity-60 max-sm:flex-auto max-sm:px-2.5`;

export function InlineCardDelete({ questionId, writeState, onOpen, onDelete }: Readonly<Props>) {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const titleId = useId();
  const consequenceId = useId();
  const warningId = useId();
  const consequence = `${consequenceId} ${warningId}`;
  const interactionsPaused = useContext(InteractionPausedContext);
  const deleting = writeState.status === 'saving';

  useEffect(() => {
    if (interactionsPaused) return;
    if (confirming) {
      keep.current?.focus({ preventScroll: true });
      keep.current?.closest('section')?.scrollIntoView?.({ block: 'nearest' });
      keep.current?.scrollIntoView?.({ block: 'nearest' });
    } else if (returnFocus.current) {
      trigger.current?.focus();
      returnFocus.current = false;
    }
  }, [confirming, interactionsPaused]);

  function cancel() {
    if (deleting) return;
    returnFocus.current = true;
    setConfirming(false);
  }

  function cancelOnEscape(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cancel();
  }

  if (writeState.status === 'failed' && writeState.reason === 'signed-out') return null;

  if (!confirming) {
    return (
      <button
        ref={trigger}
        type="button"
        aria-describedby={questionId}
        className={`${destructiveOutlineButton} w-full disabled:cursor-wait disabled:opacity-60`}
        disabled={deleting}
        onClick={() => {
          onOpen();
          setConfirming(true);
        }}
      >
        <Trash2 aria-hidden="true" className="size-[1.125em] shrink-0" />
        Delete
      </button>
    );
  }

  return (
    <section
      className={scrollMargin}
      aria-labelledby={titleId}
      aria-describedby={questionId}
      hidden={interactionsPaused}
    >
      <h3 id={titleId} className="text-label font-bold">
        Delete card?
      </h3>
      <p id={consequenceId} className="mt-1 text-support text-muted">
        Removes this card and its review progress.
      </p>
      <p id={warningId} className="mt-2 flex items-start gap-1.5 text-support font-bold text-destructive">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-[1.125em] shrink-0" />
        This can’t be undone.
      </p>
      <form
        className="mt-3"
        aria-busy={deleting}
        onSubmit={(event) => {
          event.preventDefault();
          if (!deleting) onDelete(event.currentTarget);
        }}
      >
        <DeckWriteProblem state={writeState} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            ref={keep}
            type="button"
            aria-describedby={consequence}
            aria-disabled={deleting}
            className={`${neutralOutlineButton} ${confirmationButton}`}
            onClick={cancel}
            onKeyDown={cancelOnEscape}
          >
            Keep
          </button>
          <button
            type="submit"
            aria-describedby={consequence}
            aria-disabled={deleting}
            className={`${destructiveOutlineButton} ${confirmationButton}`}
            onKeyDown={cancelOnEscape}
          >
            <Trash2 aria-hidden="true" className="size-[1.125em] shrink-0" />
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </form>
    </section>
  );
}
