import { useCallback, useContext, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { BookOpenText, type LucideIcon } from 'lucide-react';
import { neutralOutlineButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { CardSource } from '../../../shared/ui/CardSource';
import { FocusRequestContext, InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';

const detailButton =
  'pressable inline-flex min-h-12 items-center gap-1.5 rounded-control border border-accent/30 bg-surface px-2.5 py-2 text-left text-label font-semibold text-accent';

const detailsDoneButton = `${neutralOutlineButton} shrink-0 border-accent/55! bg-transparent! px-3! text-accent! focus-visible:after:opacity-0!`;
const defaultDoneButton = `${secondaryButton} shrink-0 border border-line px-3! text-label! shadow-none`;

type ReviewDetailProps = { label: string; icon: LucideIcon; children: ReactNode; compact?: boolean };

export function ReviewDetail({ label, icon: Icon, children, compact = false }: Readonly<ReviewDetailProps>) {
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const requestFocus = useContext(FocusRequestContext);
  const interactionsPaused = useContext(InteractionPausedContext);
  const horizontalPadding = compact ? 'px-6 @max-[12rem]:px-compact-gutter' : 'px-compact-gutter sm:px-6';
  const topPadding = compact ? 'pt-6 @max-[12rem]:pt-compact-gutter' : 'pt-compact-gutter sm:pt-6';

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
        className="review-detail-dialog @container m-auto max-h-[calc(100dvh-2*max(1rem,var(--phone-edge-gutter)))] w-[calc(100%-2*var(--dialog-side-gutter))] max-w-lg overflow-y-auto rounded-card bg-surface text-left text-ink shadow-card backdrop:bg-scrim/40"
      >
        <div
          className={`sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface ${horizontalPadding} ${topPadding} ${compact ? 'pb-3 @max-[12rem]:gap-x-2 @max-[12rem]:pb-2' : 'pb-2'}`}
        >
          <span
            aria-hidden="true"
            className={`hidden shrink-0 place-items-center rounded-inset bg-accent-soft text-accent ${compact ? 'size-8 @min-[16rem]:grid' : 'size-10 @min-[18rem]:grid'}`}
          >
            <Icon className="size-5" />
          </span>
          <h2
            id={titleId}
            className={`min-w-0 flex-1 font-bold wrap-break-word ${compact ? 'text-section @max-[12rem]:min-w-min @max-[12rem]:text-label' : 'basis-28 text-label @min-[20rem]:text-section'}`}
          >
            {label}
          </h2>
          <button
            type="button"
            className={`ms-auto self-start ${compact ? detailsDoneButton : defaultDoneButton}`}
            onClick={close}
          >
            Done
          </button>
        </div>
        <div
          className={`pt-2 pb-6 text-body wrap-anywhere ${horizontalPadding} ${compact ? 'space-y-5 @max-[12rem]:space-y-3 @max-[12rem]:pb-4' : 'space-y-4'}`}
        >
          {children}
        </div>
      </dialog>
    </>
  );
}

export function CardDetails({
  source,
  explanation,
  tip,
}: Readonly<{ source: string | null; explanation?: string | null; tip?: string | null }>) {
  const hasNotes = Boolean(explanation || tip);
  if (!source && !hasNotes) return null;
  return (
    <ReviewDetail label={hasNotes ? 'Card details' : 'Source'} icon={BookOpenText} compact={hasNotes}>
      {explanation && <DetailSection title="Explanation">{explanation}</DetailSection>}
      {tip && <DetailSection title="Tip to remember">{tip}</DetailSection>}
      {source && <CardSource source={source} citation={hasNotes} />}
    </ReviewDetail>
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
