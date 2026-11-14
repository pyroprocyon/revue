import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { ArrowRight, Check, Layers, LoaderCircle } from 'lucide-react';
import { ReviewFailure, type RatingRequest, type StudyCard } from '../application/reviews';
import { useBatchQueue, useForgetTodayQueue, useReviewGateway, useTodayQueue } from './ReviewProvider';
import { SavedCard } from './SavedCard';
import { RatingButtons } from './RatingButtons';
import type { Rating } from './ratings';
import { nextReviewText, reviewAction } from './TodayPage';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { REVIEW_PATH, SIGN_IN_PATH, TODAY_PATH } from '../../../shared/navigation/paths';
import { WhenSlow } from '../../../shared/ui/WhenSlow';

const reviewPanel = 'rounded-card bg-surface p-compact-gutter py-6 shadow-card sm:p-8';

export function ReviewPage() {
  const [finished, setFinished] = useState<{ count: number; note: string } | null>(null);
  const [round, setRound] = useState(0);
  const reviewed = useRef(new Set<string>());
  return (
    <div className="pb-4 sm:pb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-5">
        <h1 className="text-title font-extrabold tracking-tight">Review</h1>
        {!finished && <Link
          to={TODAY_PATH}
          className="pressable -mr-2 inline-flex min-h-12 items-center rounded-control px-2 text-label font-semibold text-muted"
        >
          Finish for now
        </Link>}
      </div>
      {finished ? (
        <ReviewCompletion
          count={finished.count}
          note={finished.note}
          onContinue={() => {
            setRound((value) => value + 1);
            setFinished(null);
          }}
        />
      ) : (
        <LoadBatch
          key={round}
          onConfirmed={(id) => reviewed.current.add(id)}
          onFinish={(note = '') => setFinished({ count: reviewed.current.size, note })}
        />
      )}
    </div>
  );
}

type Finish = (note?: string) => void;
type BatchCallbacks = { onFinish: Finish; onConfirmed: (id: string) => void };
function LoadBatch({ onFinish, onConfirmed }: Readonly<BatchCallbacks>) {
  const query = useBatchQueue();
  if (query.isPending) return <WhenSlow><div className={reviewPanel}><ReviewStatus text="Loading your cards…" /></div></WhenSlow>;
  if (query.error instanceof ReviewFailure && query.error.kind === 'signed-out')
    return <Navigate to={`${SIGN_IN_PATH}?returnTo=${REVIEW_PATH}`} replace />;
  if (query.isLoadingError)
    return <div className={reviewPanel}><QueueError error={query.error} retry={() => void query.refetch()} busy={query.isFetching} /></div>;
  // Background refreshes must not unmount an active batch or discard its pending rating.
  return <ReviewBatch initialCards={query.data.cards} onFinish={onFinish} onConfirmed={onConfirmed} />;
}

function ReviewBatch({
  initialCards,
  onFinish,
  onConfirmed,
}: Readonly<{ initialCards: StudyCard[] } & BatchCallbacks>) {
  const [cards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<'ready' | 'saving' | 'unknown' | 'signed-out'>('ready');
  const pending = useRef<RatingRequest | null>(null);
  const busy = useRef(false);
  const gateway = useReviewGateway();
  const forgetTodayQueue = useForgetTodayQueue();
  if (cards.length === 0)
    return (
      <div className={reviewPanel}>
        <h2 className="text-section font-bold">No cards are ready right now.</h2>
        <p className="mt-2 text-body text-muted">You can finish for now and return when more are due.</p>
      </div>
    );
  const card = cards[index];

  async function submit(input: RatingRequest) {
    if (busy.current) return;
    busy.current = true;
    pending.current = input;
    setStatus('saving');
    forgetTodayQueue();
    try {
      await gateway.rate(card.id, input);
      pending.current = null;
      onConfirmed(card.id);
      if (index + 1 === cards.length) onFinish();
      else {
        setIndex((value) => value + 1);
        setStatus('ready');
      }
    } catch (error) {
      if (error instanceof ReviewFailure && error.kind === 'signed-out') {
        setStatus('signed-out');
        return;
      }
      if (error instanceof ReviewFailure && ['conflict', 'unavailable', 'invalid'].includes(error.kind)) {
        onFinish(conflictMessage(error));
      } else {
        setStatus('unknown');
      }
    } finally {
      busy.current = false;
    }
  }

  function rate(rating: Rating, mode: RatingRequest['attemptMode']) {
    if (pending.current) return;
    const values = { again: 'AGAIN', hard: 'HARD', good: 'GOOD', easy: 'EASY' } as const;
    void submit({
      rating: values[rating],
      attemptMode: mode,
      requestId: crypto.randomUUID(),
      expectedVersion: card.version,
      contentVersion: card.contentVersion,
    });
  }

  if (status === 'signed-out') return <Navigate to={`${SIGN_IN_PATH}?returnTo=${REVIEW_PATH}`} replace />;
  return (
    <>
      <ReviewProgress title={card.setTitle} completed={index} total={cards.length} />
      <SavedCard
        key={card.id}
        card={card}
        renderControls={(mode) => {
          if (status === 'saving') return <ReviewStatus text="Saving your rating…" />;
          if (status === 'unknown')
            return (
              <div className="rounded-control bg-highlight-soft/60 p-4 text-left">
                <p role="alert" className="text-body">
                  We couldn’t confirm your rating. Retry to check and save it safely.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (pending.current) void submit(pending.current);
                  }}
                  className={`${primaryButton} mt-4 w-full`}
                >
                  Retry rating
                </button>
                <p className="mt-3 text-support text-muted">
                  If you leave, Today will check what’s saved when you return.
                </p>
              </div>
            );
          return mode === 'SHOWN' ? (
            <button type="button" onClick={() => rate('again', mode)} className={`${primaryButton} w-full`}>
              {index + 1 === cards.length ? 'Finish batch' : 'Next card'}
              <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
            </button>
          ) : (
            <RatingButtons onRate={(rating) => rate(rating, mode)} />
          );
        }}
      />
    </>
  );
}

function ReviewProgress({ title, completed, total }: Readonly<{ title: string; completed: number; total: number }>) {
  return (
    <div className="mb-3 sm:mb-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-support sm:mb-3">
        <p className="min-w-0 flex-1 basis-40 font-semibold wrap-anywhere">{title}</p>
        <p className="text-muted" aria-live="polite">Card {completed + 1} of {total}</p>
      </div>
      <progress aria-label="Batch progress" value={completed} max={total}
        aria-valuetext={`${completed} of ${total} ${total === 1 ? 'card' : 'cards'} reviewed`}
        className="review-progress" />
    </div>
  );
}

function ReviewStatus({ text }: Readonly<{ text: string }>) {
  return <output className="inline-flex min-h-12 items-center gap-3 text-body text-muted">
    <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin" />{text}
  </output>;
}

function conflictMessage(error: ReviewFailure) {
  if (error.kind === 'unavailable')
    return 'This card is no longer available. Your remaining cards have been refreshed.';
  if (error.reason === 'DAILY_LIMIT')
    return 'You’ve reached today’s new-card limit. Your remaining cards have been refreshed.';
  if (error.reason === 'NOT_DUE' || error.reason === 'STALE_SCHEDULE')
    return 'This card was already reviewed or changed in another tab. Your remaining cards have been refreshed.';
  return 'This rating couldn’t be accepted. Your remaining cards have been refreshed.';
}

function ReviewCompletion({
  count,
  note,
  onContinue,
}: Readonly<{ count: number; note: string; onContinue: () => void }>) {
  const query = useTodayQueue();
  const heading = useRef<HTMLHeadingElement>(null);
  const loaded = query.isSuccess;
  useEffect(() => {
    if (loaded) heading.current?.focus();
  }, [loaded]);
  const remaining = query.data ? query.data.dueCards + query.data.newCards : 0;
  const Icon = count > 0 ? Check : Layers;
  return (
    <section className={reviewPanel}>
      {query.isPending && <WhenSlow><ReviewStatus text="Checking your remaining cards…" /></WhenSlow>}
      {query.isError && <QueueError error={query.error} retry={() => void query.refetch()} busy={query.isFetching} />}
      {query.isSuccess && <>
        {note && <output className="mb-4 block text-body text-muted">{note}</output>}
        <span className="mb-6 grid size-14 place-items-center rounded-control bg-accent-soft text-accent">
          <Icon aria-hidden="true" className="size-7" />
        </span>
        <h2 ref={heading} tabIndex={-1} className="text-title font-bold outline-none">
          {count} {count === 1 ? 'card' : 'cards'} reviewed
        </h2>
        <p className="mt-3 text-body text-muted">{remainingText(remaining, query.data.availableCards)}</p>
        {remaining === 0 && query.data.availableCards > 0 && query.data.nextReviewDate && (
          <p className="mt-4 text-label font-semibold text-accent">Next review: {nextReviewText(query.data.nextReviewDate)}</p>
        )}
      </>}
      <div className="mt-8 flex flex-wrap gap-3">
        {query.isSuccess && remaining > 0 && (
          <button type="button" onClick={onContinue} className={primaryButton}>
            {remaining >= 5 ? 'Continue with 5' : reviewAction(remaining)}
            <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
          </button>
        )}
        <Link to={TODAY_PATH} className={secondaryButton}>
          Back to Today
        </Link>
      </div>
    </section>
  );
}

function remainingText(remaining: number, available: number) {
  if (remaining > 0) return `${remaining} ${remaining === 1 ? 'card remains' : 'cards remain'}.`;
  return available > 0 ? 'All caught up.' : 'No cards are available to review right now.';
}

function QueueError({ error, retry, busy }: Readonly<{ error: Error; retry: () => void; busy: boolean }>) {
  if (error instanceof ReviewFailure && error.kind === 'signed-out')
    return <Navigate to={`${SIGN_IN_PATH}?returnTo=${REVIEW_PATH}`} replace />;
  return (
    <div>
      <p role="alert">Your cards couldn’t load. Try again.</p>
      <button type="button" disabled={busy} onClick={retry} className={`${primaryButton} mt-4`}>
        Try again
      </button>
    </div>
  );
}
