import { useCallback, useContext, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { FocusRequestContext, InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';

const detailButton =
  'pressable inline-flex min-h-12 items-center gap-1.5 rounded-control border border-accent/30 bg-surface px-2.5 py-2 text-left text-label font-semibold text-accent';

type ReviewDetailProps = { label: string; icon: LucideIcon; children: ReactNode };

export function ReviewDetail({ label, icon: Icon, children }: Readonly<ReviewDetailProps>) {
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const requestFocus = useContext(FocusRequestContext);
  const interactionsPaused = useContext(InteractionPausedContext);

  const close = useCallback(() => {
    if (!dialog.current?.open) return;
    dialog.current.close();
    requestFocus(trigger.current);
  }, [requestFocus]);

  // A modal dialog escapes its ancestors' inert state, so close it when the session pauses.
  useLayoutEffect(() => {
    if (interactionsPaused) close();
  }, [interactionsPaused, close]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className={detailButton}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </button>
      <dialog
        ref={dialog}
        inert={interactionsPaused}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        className="@container m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-32px)] max-w-lg overflow-y-auto rounded-card bg-surface text-left text-ink shadow-card backdrop:bg-scrim/40"
      >
        <div className="sticky top-0 flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface px-compact-gutter pt-4 pb-2 sm:px-6 sm:pt-5">
          <span
            aria-hidden="true"
            className="hidden size-10 shrink-0 place-items-center rounded-inset bg-accent-soft text-accent @min-[18rem]:grid"
          >
            <Icon className="size-5" />
          </span>
          <h2
            id={titleId}
            className="min-w-0 flex-1 basis-28 text-label font-bold wrap-break-word @min-[20rem]:text-section"
          >
            {label}
          </h2>
          <button
            type="button"
            className={`${secondaryButton} shrink-0 border border-line px-3! text-label! shadow-none`}
            onClick={close}
          >
            Done
          </button>
        </div>
        <div className="space-y-4 px-compact-gutter pt-2 pb-6 text-body wrap-anywhere sm:px-6">{children}</div>
      </dialog>
    </>
  );
}

export function CardDetails({ explanation, tip }: Readonly<{ explanation: string | null; tip: string | null }>) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const interactionsPaused = useContext(InteractionPausedContext);

  useLayoutEffect(() => {
    if (interactionsPaused && disclosure.current) disclosure.current.open = false;
  }, [interactionsPaused]);

  return (
    <details ref={disclosure} className="rounded-control border border-line bg-surface text-left">
      <summary className="pressable min-h-12 cursor-pointer rounded-control px-3 py-3 text-label font-semibold text-accent">
        Card details
      </summary>
      <div className="space-y-4 px-3 pt-1 pb-3 text-body">
        {explanation && <DetailSection title="Explanation">{explanation}</DetailSection>}
        {tip && <DetailSection title="Tip to remember">{tip}</DetailSection>}
      </div>
    </details>
  );
}

export function DetailSection({ title, children }: Readonly<{ title: string; children: string }>) {
  return (
    <section>
      <h3 className="text-label font-semibold">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere">{children}</p>
    </section>
  );
}
