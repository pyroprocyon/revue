import { rateTrial, startTrial, trialSummary } from '../domain/trialSession';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { PublicContentReader, PublicSet, TrialCard, TrialCards } from '../../catalog/application/publicContent';
import {
  canRecheckTrial,
  publicContentKeys,
  trialCardsQuery,
  trialConflictsWithPreview,
  type PublicContentRead,
} from '../../catalog/application/publicContentQueries';
import { TRIAL_CARD_COUNT } from '../../../shared/product/studyRules';
import { cardNoun } from '../../../shared/ui/cardCount';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { BackButton, HomeLink } from '../../../shared/ui/HeaderLinks';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { LoadingScreen, MessageScreen } from '../../../shared/ui/MessageScreen';
import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';
import { PageLayout } from '../../../shared/ui/PageLayout';
import { ActionRow } from '../../../shared/ui/LayoutParts';
import { StudyLayout } from '../../../shared/ui/StudyLayout';
import { usePublicSession } from '../../../shared/navigation/publicSession';
import { routeState } from '../../../shared/navigation/routeState';
import { SETS_PATH, setPath } from '../../../shared/navigation/paths';
import { FlashCard } from './FlashCard';
import { RatingButtons } from './RatingButtons';
import { RATINGS, RecallMeter, type Rating } from './ratings';

/** "Try 5 cards": a set's first five cards, practiced in the browser and never saved. */
export function TrialPage({ reader }: Readonly<{ reader: Pick<PublicContentReader, 'trialCards'> }>) {
  const { setKey = '' } = useParams();
  const { trialPreviewKey } = routeState(useLocation());
  return <TrialEntry key={setKey} setKey={setKey} reader={reader} previewKey={trialPreviewKey} />;
}

function TrialEntry({
  setKey,
  reader,
  previewKey,
}: Readonly<{ setKey: string; reader: Pick<PublicContentReader, 'trialCards'>; previewKey?: string }>) {
  const queryClient = useQueryClient();
  const [preview] = useState(() =>
    previewKey === undefined
      ? undefined
      : queryClient.getQueryData<PublicContentRead<PublicSet | null>>(publicContentKeys.set(previewKey)),
  );
  const trialCards = useQuery(trialCardsQuery(reader, setKey));
  const trialRead = trialCards.data;
  const needsFreshCards =
    trialRead !== undefined &&
    preview !== undefined &&
    (preview.value === null || preview.value.setKey === setKey) &&
    ((preview.value?.trialAvailable === true && trialRead.finished < preview.started) ||
      trialConflictsWithPreview(trialRead, preview.finished, preview.value));
  const refetchTrial = trialCards.refetch;
  const recheckTrial =
    needsFreshCards && trialCards.fetchStatus === 'idle' && canRecheckTrial(trialCards.error, preview.finished);
  useEffect(() => {
    if (recheckTrial) void refetchTrial({ cancelRefetch: false });
  }, [recheckTrial, refetchTrial]);

  if (trialCards.isPending || recheckTrial || (needsFreshCards && trialCards.fetchStatus !== 'idle')) {
    return (
      <LoadingScreen
        trial
        text="Loading the cards…"
        top={<TrialHeader setKey={setKey} title={preview?.value?.title ?? 'Try 5 cards'} />}
      />
    );
  }
  if (trialCards.isLoadingError || needsFreshCards) {
    return <LoadFailed onRetry={() => void trialCards.refetch()} retrying={trialCards.isFetching} />;
  }
  if (trialCards.data.value === null) {
    return (
      <MessageScreen
        title={`The ${TRIAL_CARD_COUNT}-card trial isn't available right now.`}
        action={<SetLinks setKey={setKey} primary="back-to-set" />}
      >
        <p>Check back later.</p>
      </MessageScreen>
    );
  }
  return <Trial setKey={setKey} initialContent={trialCards.data.value} />;
}

function Trial({ setKey, initialContent }: Readonly<{ setKey: string; initialContent: TrialCards }>) {
  // A running trial keeps its starting batch, even when the query refreshes for the next visit.
  const [trial, setTrial] = useState(() => ({
    content: initialContent,
    session: startTrial(initialContent.cards.length),
  }));
  const { content, session } = trial;
  const { ratings } = session;
  const cardCount = content.cards.length;
  const cardIndex = ratings.length;

  if (cardIndex === cardCount) {
    return <TrialFinished setKey={setKey} cards={content.cards} ratings={ratings} />;
  }
  const card = content.cards[cardIndex];

  function rate(rating: Rating) {
    setTrial((current) => ({ ...current, session: rateTrial(current.session, rating) }));
  }

  return (
    <StudyLayout top={<TrialHeader setKey={setKey} title={content.setTitle} />}>
      <h1 className="sr-only">Try {cardCount} cards</h1>
      <div data-trial className="review-flow loading-reveal pt-(--review-card-top-gap) pb-4 sm:pb-6">
        {/* A new key per card, so each card starts on its front instead of turning back over. */}
        <FlashCard
          key={card.key}
          card={card}
          publisherName={content.publisherName}
          position={{ index: cardIndex, total: cardCount }}
          ratingControls={<RatingButtons onRate={rate} />}
        />
      </div>
    </StudyLayout>
  );
}

function TrialHeader({ setKey, title }: Readonly<{ setKey: string; title: string }>) {
  return (
    <div className="study-session-heading flex w-full flex-wrap items-center justify-between gap-x-3">
      <div className="min-w-0 flex-[1_1_8rem]">
        <p className="text-lg leading-tight font-bold wrap-anywhere sm:text-section">{title}</p>
        <p className="mt-1 text-support text-muted">Trial · Progress isn’t saved</p>
      </div>
      <BackButton label="Exit trial" fallbackPath={setPath(setKey)} />
    </div>
  );
}

type TrialFinishedProps = {
  setKey: string;
  cards: TrialCard[];
  ratings: readonly Rating[];
};

/** The end of the trial: each card with its rating and when an account would show it again. */
function TrialFinished({ setKey, cards, ratings }: Readonly<TrialFinishedProps>) {
  const session = usePublicSession();
  const primaryLinkBySession = {
    checking: undefined,
    'signed-in': 'back-to-set',
    'signed-out': 'another-set',
  } as const;
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const groups = trialSummary(cards, ratings);
  const finishedIcon = (
    <span className="mb-3 grid size-10 place-items-center rounded-full bg-accent-soft text-accent-strong">
      <Flag aria-hidden="true" size={22} />
    </span>
  );
  return (
    <PageLayout top={<HomeLink />}>
      <div className="mt-3 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section className="result-panel">
          {finishedIcon}
          <h1 {...heading} className="text-title font-extrabold tracking-tight outline-none">
            You practiced {cards.length} cards.
          </h1>
          <p className="my-4 text-body text-muted">This practice wasn’t saved.</p>
          <SetLinks setKey={setKey} primary={primaryLinkBySession[session]} />
        </section>
        <section
          aria-label="Example schedule"
          className="rounded-card border border-line bg-surface p-compact-gutter sm:p-6"
        >
          <h2 className="mb-2 text-section font-bold">Example schedule</h2>
          {groups.map((group, index) => (
            <ReviewTimingGroup key={group.when} when={group.when} cards={group.cards} first={index === 0} />
          ))}
        </section>
      </div>
    </PageLayout>
  );
}

type ReviewedCard = {
  card: TrialCard;
  rating: Rating;
};

type ReviewTimingGroupProps = {
  when: string;
  cards: ReviewedCard[];
  first: boolean;
};

function ReviewTimingGroup({ when, cards, first }: Readonly<ReviewTimingGroupProps>) {
  const headingId = useId();
  return (
    <details open={first} className="border-t border-line">
      <summary className="min-h-12 cursor-pointer content-center font-semibold">
        <span id={headingId}>{when}</span>{' '}
        <span className="text-support text-muted">
          {cards.length} {cardNoun(cards.length)}
        </span>
      </summary>
      <ul aria-labelledby={headingId} className="mt-1 divide-y divide-line">
        {cards.map(({ card, rating }) => (
          <SummaryCardRow key={card.key} question={card.question} rating={rating} />
        ))}
      </ul>
    </details>
  );
}

function SummaryCardRow({ question, rating }: Readonly<{ question: string; rating: Rating }>) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-inset ${RATINGS[rating].tintClass}`}>
        <RecallMeter rating={rating} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="wrap-anywhere font-semibold text-ink">{question}</p>
        <p className="mt-1 text-support">{RATINGS[rating].label}</p>
      </div>
    </li>
  );
}

type SetLinksProps = {
  setKey: string;
  /** No emphasis while the session is unknown; both public destinations remain usable. */
  primary?: 'another-set' | 'back-to-set';
};

function SetLinks({ setKey, primary }: Readonly<SetLinksProps>) {
  const { fromPublished } = routeState(useLocation());
  const navigate = useNavigate();
  if (fromPublished) {
    return (
      <ActionRow>
        <button type="button" className={primaryButton} onClick={() => void navigate(-2)}>
          Browse reviewers
        </button>
        <button type="button" className={secondaryButton} onClick={() => void navigate(-1)}>
          View topic details
        </button>
      </ActionRow>
    );
  }
  return (
    <ActionRow>
      <Link to={SETS_PATH} className={primary === 'another-set' ? primaryButton : secondaryButton}>
        Browse reviewers
      </Link>
      <Link to={setPath(setKey)} className={primary === 'back-to-set' ? primaryButton : secondaryButton}>
        View topic details
      </Link>
    </ActionRow>
  );
}
