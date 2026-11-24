import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useLocation, useParams, useOutletContext } from 'react-router';
import { ArrowRight, CalendarClock, Layers, Trophy } from 'lucide-react';
import {
  ReviewFailure,
  type RatingRequest,
  type ReviewSelection,
  type StudyCard,
  type StudyQueue,
} from '../application/reviews';
import { useBatchQueue, useSubmitRating, useTodayQueue } from './ReviewProvider';
import { SavedCard } from './SavedCard';
import { rememberReview, forgetReview } from './pausedReview';
import { RatingButtons } from './RatingButtons';
import type { Rating } from './ratings';
import { nextReviewText, reviewAction, statusPanel } from './TodayPage';
import { REVIEW_BATCH_SIZE } from '../../../shared/product/studyRules';
import { cardNoun } from '../../../shared/ui/cardCount';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { TODAY_PATH, isReviewTopic, signInPath } from '../../../shared/navigation/paths';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { LoadingPlaceholder, LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';
import { NavigationLink } from '../../../shared/ui/NavigationLink';

export function ReviewPage({ includeNew = false }: Readonly<{ includeNew?: boolean }>) {
  const { topic } = useParams();
  if (!isReviewTopic(topic)) return <Navigate replace to={TODAY_PATH} />;
  return <TopicReview key={`${topic}:${includeNew}`} selection={{ topic, includeNew }} />;
}

function TopicReview({ selection }: Readonly<{ selection: ReviewSelection }>) {
  const [finished, setFinished] = useState<{ count: number; note: string; title: string } | null>(null);
  const reviewed = useRef(new Set<string>());
  return (
    <div className="review-flow pb-4 sm:pb-6">
      {finished ? (
        <ReviewCompletion
          selection={selection}
          count={finished.count}
          title={finished.title}
          note={finished.note}
          onContinue={() => setFinished(null)}
        />
      ) : (
        <LoadBatch
          selection={selection}
          onConfirmed={(id) => reviewed.current.add(id)}
          onFinish={(title, note = '') => setFinished({ count: reviewed.current.size, title, note })}
        />
      )}
    </div>
  );
}

function ReviewHeading({ title }: Readonly<{ title?: string }>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3">
      <h1
        className={
          title
            ? 'min-w-0 flex-[1_1_8rem] text-lg leading-tight font-bold wrap-anywhere sm:text-section'
            : 'text-title font-extrabold tracking-tight'
        }
      >
        {title ?? 'Review'}
      </h1>
      <NavigationLink to={TODAY_PATH} back>
        Finish for now
      </NavigationLink>
    </div>
  );
}

type Finish = (title: string, note?: string) => void;
type BatchCallbacks = { onFinish: Finish; onConfirmed: (id: string) => void };
function LoadBatch({ selection, onFinish, onConfirmed }: Readonly<BatchCallbacks & { selection: ReviewSelection }>) {
  const query = useBatchQueue(selection);
  const { username } = useOutletContext<{ username: string }>();
  useEffect(() => {
    if (selection.includeNew && query.isSuccess && query.data.cards.length > 0) {
      rememberReview(username, selection.topic);
    }
  }, [selection.includeNew, selection.topic, query.isSuccess, query.data, username]);
  if (query.data?.cards.length && !query.isError) {
    return <ReviewBatch cards={query.data.cards} onFinish={onFinish} onConfirmed={onConfirmed} />;
  }
  let feedback;
  if (query.isPending) {
    feedback = (
      <WhenSlow>
        <LoadingPlaceholder kind="study" className="mt-3">
          Loading your cards…
        </LoadingPlaceholder>
      </WhenSlow>
    );
  } else if (query.isError) {
    feedback = (
      <div className={statusPanel}>
        <QueueError error={query.error} retry={() => void query.refetch()} busy={query.isFetching} />
      </div>
    );
  } else {
    return (
      <NoCardsReady
        topicTitle={query.data.topicTitle}
        dailyNewCardLimitReached={selection.includeNew && (query.data.unintroducedCards ?? 0) > 0}
      />
    );
  }
  return (
    <>
      <ReviewHeading />
      {feedback}
    </>
  );
}

function NoCardsReady({
  topicTitle,
  dailyNewCardLimitReached,
}: Readonly<{ topicTitle?: string | null; dailyNewCardLimitReached: boolean }>) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <div className="review-pause review-result screen-enter gap-4 text-center">
      <span className="grid size-14 place-items-center rounded-control bg-saved-set-soft text-saved-set">
        <CalendarClock aria-hidden="true" className="size-6" />
      </span>
      <div className="w-full max-w-[38ch] min-w-0 wrap-anywhere">
        {topicTitle && <p className="mb-1 text-support font-semibold text-saved-set">{topicTitle}</p>}
        <h1 {...heading} className="text-title font-extrabold tracking-tight text-balance outline-none">
          {dailyNewCardLimitReached ? 'Daily new-card limit reached' : 'No cards ready right now'}
        </h1>
        <p className="mt-2 text-body text-pretty text-muted">
          {dailyNewCardLimitReached
            ? 'You can start this topic’s new cards tomorrow.'
            : 'Come back when more cards are due.'}
        </p>
      </div>
      <Link className={`${primaryButton} max-w-full`} to={TODAY_PATH}>
        <span className="min-w-0 wrap-anywhere">Back to Today</span>
        <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
      </Link>
    </div>
  );
}

function ReviewBatch({ cards, onFinish, onConfirmed }: Readonly<{ cards: StudyCard[] } & BatchCallbacks>) {
  const { pathname } = useLocation();
  const { reviewHeader } = useOutletContext<{ reviewHeader: HTMLElement | null }>();
  const [batch, setBatch] = useState(cards);
  const [index, setIndex] = useState(0);
  const [cardWasEdited, setCardWasEdited] = useState(false);
  const [status, setStatus] = useState<'ready' | 'saving' | 'unknown' | 'signed-out'>('ready');
  const pending = useRef<RatingRequest | null>(null);
  const busy = useRef(false);
  const retryButton = useRef<HTMLButtonElement>(null);
  const requestFocus = useContext(FocusRequestContext);
  const submitRating = useSubmitRating();
  useEffect(() => {
    const button = retryButton.current;
    if (status === 'unknown' && button && document.activeElement === document.body) requestFocus(button);
  }, [status, requestFocus]);
  const card = batch[index];

  async function submit(input: RatingRequest) {
    if (busy.current) return;
    busy.current = true;
    pending.current = input;
    setStatus('saving');
    try {
      await submitRating(card.id, input);
      pending.current = null;
      onConfirmed(card.id);
      if (index + 1 === batch.length) onFinish(card.setTitle);
      else {
        setIndex((value) => value + 1);
        setCardWasEdited(false);
        setStatus('ready');
      }
    } catch (error) {
      if (error instanceof ReviewFailure && error.kind === 'signed-out') {
        setStatus('signed-out');
        return;
      }
      if (error instanceof ReviewFailure && error.reason === 'CONTENT_CHANGED' && error.currentCard) {
        tryEditedCard(error.currentCard);
        return;
      }
      if (error instanceof ReviewFailure && ['conflict', 'unavailable', 'invalid'].includes(error.kind)) {
        onFinish(card.setTitle, conflictMessage(error));
      } else {
        setStatus('unknown');
      }
    } finally {
      busy.current = false;
    }
  }

  function tryEditedCard(edited: StudyCard) {
    pending.current = null;
    setBatch((current) => current.map((item, position) => (position === index ? edited : item)));
    setCardWasEdited(true);
    setStatus('ready');
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

  if (status === 'signed-out') return <Navigate to={signInPath(pathname)} replace />;
  return (
    <>
      {reviewHeader && createPortal(<ReviewHeading title={card.setTitle} />, reviewHeader)}
      <progress
        aria-label="Batch progress"
        value={index}
        max={batch.length}
        aria-valuetext={`${index} of ${batch.length} ${cardNoun(batch.length)} reviewed`}
        className="sr-only"
      />
      {cardWasEdited && (
        <output className="mb-3 block rounded-control bg-highlight-soft/60 p-4 text-body sm:mb-5">
          This card was edited. Your rating wasn’t saved, so try the updated question.
        </output>
      )}
      <SavedCard
        key={`${card.id}:${card.contentVersion}`}
        card={card}
        position={{ index, total: batch.length }}
        renderControls={(mode) => {
          if (status === 'saving') return <LoadingStatus className="min-h-12">Saving your rating…</LoadingStatus>;
          if (status === 'unknown')
            return (
              <div className="rounded-control bg-highlight-soft/60 p-4 text-left">
                <p role="alert" className="text-body">
                  We couldn’t confirm your rating. Retry to check and save it safely.
                </p>
                <button
                  ref={retryButton}
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
              {index + 1 === batch.length ? 'Finish batch' : 'Next card'}
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
  selection,
  count,
  title,
  note,
  onContinue,
}: Readonly<{ selection: ReviewSelection; count: number; title: string; note: string; onContinue: () => void }>) {
  const query = useTodayQueue(selection);
  const learnerWide = useTodayQueue();
  const { username } = useOutletContext<{ username: string }>();
  const remaining = query.data ? query.data.dueCards + query.data.newCards : 0;
  const unfinished = query.data ? query.data.dueCards + (query.data.unintroducedCards ?? query.data.newCards) : 0;
  useEffect(() => {
    if (query.isSuccess && !query.isFetching && unfinished === 0) forgetReview(username, selection.topic);
  }, [query.isSuccess, query.isFetching, unfinished, username, selection.topic]);
  const celebrated = count > 0;
  return (
    <section className={`review-result screen-enter mt-3 ${celebrated ? 'review-completion' : 'result-panel'}`}>
      <ReviewCompletionSummary
        count={count}
        status={query.isSuccess ? remainingText(remaining, query.data.availableCards, title) : title}
      />
      <div className={celebrated ? 'review-completion-follow' : 'mt-4 space-y-4'}>
        <div className="review-completion-feedback space-y-3 empty:hidden">
          {note && <output className="block text-body text-muted">{note}</output>}
          {query.isPending && (
            <WhenSlow>
              <LoadingStatus>Checking your remaining cards…</LoadingStatus>
            </WhenSlow>
          )}
          {query.isError && (
            <QueueError error={query.error} retry={() => void query.refetch()} busy={query.isFetching} />
          )}
          {query.isSuccess && remaining === 0 && learnerWide.isSuccess && !learnerWide.isFetching && (
            <AfterThisTopic today={learnerWide.data} finishedTopic={selection.topic} />
          )}
        </div>
        <div className={celebrated ? 'review-completion-actions review-dock' : 'flex flex-wrap gap-3'}>
          {query.isSuccess && remaining > 0 && (
            <button type="button" onClick={onContinue} className={primaryButton}>
              <span className="min-w-0 wrap-anywhere">
                {remaining >= REVIEW_BATCH_SIZE ? `Continue with ${REVIEW_BATCH_SIZE}` : reviewAction(remaining)}
              </span>
              <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
            </button>
          )}
          <Link to={TODAY_PATH} className={remaining > 0 ? secondaryButton : primaryButton}>
            <span className="min-w-0 wrap-anywhere">Back to Today</span>
            {celebrated && <ArrowRight aria-hidden="true" className="size-5 shrink-0" />}
          </Link>
        </div>
      </div>
    </section>
  );
}

function ReviewCompletionSummary({ count, status }: Readonly<{ count: number; status: string }>) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const celebrated = count > 0;
  const CountHeading = celebrated ? 'h2' : 'h1';
  return (
    <div className={celebrated ? 'review-completion-summary' : undefined}>
      {celebrated ? (
        <div className="review-celebration" aria-hidden="true">
          <span className="review-celebration-mark">
            <Trophy className="size-[1.875rem]" strokeWidth={1.9} />
          </span>
          <div className="review-confetti">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : (
        <span className="mb-6 grid size-14 place-items-center rounded-control bg-accent-soft text-accent">
          <Layers aria-hidden="true" className="size-7" />
        </span>
      )}
      <div className="min-w-0 wrap-anywhere">
        {celebrated && <h1 className="mb-1 text-title font-extrabold tracking-tight sm:text-title-lg">Nice work!</h1>}
        <CountHeading
          {...heading}
          className={celebrated ? 'text-body font-medium outline-none' : 'text-title font-bold outline-none'}
        >
          {count} {cardNoun(count)} reviewed
        </CountHeading>
        <p className={celebrated ? 'review-completion-status' : 'mt-3 text-body text-muted'}>{status}</p>
      </div>
    </div>
  );
}

/**
 * Overall claims come only from the learner's full Today summary; new cards are never counted as due. The previous
 * server's summary has no topics and an older next-date rule, so it supports no overall claim.
 */
function AfterThisTopic({ today, finishedTopic }: Readonly<{ today: StudyQueue; finishedTopic: string }>) {
  if (!today.topics) return null;
  const dueElsewhere = today.topics
    .filter((topic) => topic.id !== finishedTopic)
    .reduce((total, topic) => total + topic.dueCards, 0);
  if (dueElsewhere > 0) {
    return (
      <p className="review-completion-next text-label font-semibold text-accent">
        {dueElsewhere === 1 ? '1 card is due in another topic.' : `${dueElsewhere} cards are due in other topics.`}
      </p>
    );
  }
  if (today.dueCards > 0 || today.newCards > 0 || !today.nextReviewDate) return null;
  return (
    <p className="review-completion-next text-label font-semibold text-accent">
      Next review: {nextReviewText(today.nextReviewDate)}
    </p>
  );
}

function remainingText(remaining: number, available: number, title: string) {
  if (remaining > 0) return `${remaining} ${remaining === 1 ? 'card remains' : 'cards remain'} in ${title}`;
  return available > 0 ? `Review complete for ${title}` : `No cards are available in ${title} right now.`;
}

function QueueError({ error, retry, busy }: Readonly<{ error: Error; retry: () => void; busy: boolean }>) {
  const { pathname } = useLocation();
  if (error instanceof ReviewFailure && error.kind === 'signed-out')
    return <Navigate to={signInPath(pathname)} replace />;
  return (
    <div>
      <p role="alert">Your cards couldn’t load. Try again.</p>
      <button type="button" disabled={busy} onClick={retry} className={`${primaryButton} mt-4`}>
        Try again
      </button>
    </div>
  );
}
