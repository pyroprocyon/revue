import type { LucideIcon } from 'lucide-react';
import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { destructiveButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';

type ConfirmDeleteProps = {
  describedBy?: string;
  triggerLabel: string;
  triggerIcon?: LucideIcon;
  triggerClassName?: string;
  subject?: string;
  warning: string;
  keepLabel: string;
  confirmLabel: string;
  deleting: boolean;
  problem: ReactNode;
  onOpen: () => void;
  onConfirm: (close: () => void) => void;
};

const quietButton =
  'pressable inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-control px-3 py-2 text-support font-semibold text-muted';

/** Deleting cannot be undone, so the learner reads what will be lost and confirms before anything is sent. */
export function ConfirmDelete({
  describedBy,
  triggerLabel,
  triggerIcon: TriggerIcon,
  triggerClassName = quietButton,
  subject,
  warning,
  keepLabel,
  confirmLabel,
  deleting,
  problem,
  onOpen,
  onConfirm,
}: Readonly<ConfirmDeleteProps>) {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const warningId = useId();
  const interactionsPaused = useContext(InteractionPausedContext);
  // A modal dialog escapes its ancestors' inert state, so the confirmation waits until the session check ends.
  const showConfirmation = confirming && !interactionsPaused;

  useEffect(() => {
    const element = dialog.current;
    if (!showConfirmation || !element) return;
    element.showModal();
    return () => element.close();
  }, [showConfirmation]);

  function close() {
    dialog.current?.close();
    setConfirming(false);
    trigger.current?.focus();
  }

  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={triggerClassName}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        onClick={() => {
          onOpen();
          setConfirming(true);
        }}
      >
        {TriggerIcon && <TriggerIcon aria-hidden="true" className="size-[1.125em] shrink-0" />}
        {triggerLabel}
      </button>
      {showConfirmation && (
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          aria-describedby={warningId}
          aria-busy={deleting}
          onCancel={(event) => {
            event.preventDefault();
            if (!deleting) close();
          }}
          className="@container/delete m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-md overflow-y-auto rounded-card bg-surface p-compact-gutter text-ink shadow-card backdrop:bg-ink/40 sm:p-6"
        >
          <h2 id={titleId} className="text-section font-bold">
            {confirmLabel}?
          </h2>
          {subject && (
            <p className="mt-3 line-clamp-3 rounded-control bg-subtle px-3 py-2 text-support font-semibold wrap-anywhere">
              {subject}
            </p>
          )}
          <p id={warningId} className="mt-3 text-body text-muted">
            {warning}
          </p>
          <div className="mt-5 grid gap-2.5 @min-[18rem]/delete:grid-cols-2">
            <div className="col-span-full empty:hidden">{problem}</div>
            <button type="button" className={secondaryButton} disabled={deleting} onClick={close}>
              {keepLabel}
            </button>
            <button type="button" className={destructiveButton} disabled={deleting} onClick={() => onConfirm(close)}>
              {deleting ? 'Deleting…' : confirmLabel}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
