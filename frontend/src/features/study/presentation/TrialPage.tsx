import { rateTrial, startTrial, trialSummary } from '../domain/trialSession';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { PublicContentReader, TrialCard, TrialCards } from '../../catalog/application/publicContent';
import { trialCardsQuery } from '../../catalog/application/publicContentQueries';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { BackButton } from '../../../shared/ui/HeaderLinks';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { LoadingScreen, MessageScreen } from '../../../shared/ui/MessageScreen';
import { ActionRow } from '../../../shared/ui/LayoutParts';
import { StudyLayout } from '../../../shared/ui/StudyLayout';
import { usePublicSession } from '../../../shared/navigation/publicSession';
import { SETS_PATH, setPath } from '../../../shared/navigation/paths';
import { FlashCard } from './FlashCard';
import { RatingButtons } from './RatingButtons';
import { RATINGS, RecallMeter, type Rating } from './ratings';

/** "Try 5 cards": a set's first five cards, practiced in the browser and never saved. */
export function TrialPage({ reader }: Readonly<{ reader: Pick<PublicContentReader, 'trialCards'> }>) {
  const { setKey = '' } = useParams();
  const trialCards = useQuery(trialCardsQuery(reader, setKey));

  if (trialCards.isPending) {
    return <LoadingScreen text="Loading the cards…" />;
  }
  if (trialCards.isLoadingError) {
    return <LoadFailed onRetry={() => void trialCards.refetch()} retrying={trialCards.isFetching} />;
  }
  if (trialCards.data === null) {
    return (
      <MessageScreen
        title="The 5-card trial isn't available right now."
        action={<SetLinks setKey={setKey} primary="back-to-set" />}
      >
        <p>Check back later.</p>
      </MessageScreen>
    );
  }
  return <Trial key={setKey} setKey={setKey} initialContent={trialCards.data} />;
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

  const top = (
    <>
      <BackButton label={content.setTitle} fallbackPath={setPath(setKey)} />
      <p aria-live="polite" className="ml-auto shrink-0 text-support text-muted">
        Card {cardIndex + 1} of {cardCount}
      </p>
    </>
  );
  return (
    <StudyLayout top={top}>
      <h1 className="sr-only">Try {cardCount} cards</h1>
      <TrialProgress position={cardIndex + 1} cardCount={cardCount} />
      {/* A new key per card, so each card starts on its front instead of turning back over. */}
      <FlashCard key={card.key} card={card} publisherName={content.publisherName} ratingControls={<RatingButtons onRate={rate} />} />
    </StudyLayout>
  );
}

function TrialProgress({ position, cardCount }: Readonly<{ position: number; cardCount: number }>) {
  return (
    <div aria-hidden="true" className="mb-3 h-1.5 overflow-hidden rounded-full bg-subtle">
      <div
        className="h-full origin-left rounded-full bg-accent transition-transform duration-200 ease-standard"
        style={{ transform: `scaleX(${position / cardCount})` }}
      />
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
  const primary = {
    checking: undefined,
    'signed-in': 'back-to-set',
    'signed-out': 'another-set',
  } as const;
  const groups = trialSummary(cards, ratings);
  const finishedIcon = (
    <span className="mb-3 grid size-10 place-items-center rounded-full bg-accent-soft text-accent-strong">
      <Check aria-hidden="true" size={22} strokeWidth={2.5} />
    </span>
  );
  return (
    <MessageScreen
      title={`You practiced ${cards.length} cards.`}
      icon={finishedIcon}
      action={<SetLinks setKey={setKey} primary={primary[session]} />}
    >
      <p>Example schedule, soonest first.</p>
      <div className="space-y-6">
        {groups.map((group, index) => (
          <ReviewTimingGroup key={group.when} when={group.when} cards={group.cards} first={index === 0} />
        ))}
      </div>
      <p className="text-support">This practice wasn’t saved.</p>
    </MessageScreen>
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
    <section aria-labelledby={headingId}>
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-inset px-3 py-2 ${first ? 'bg-highlight-soft' : 'bg-subtle'}`}
      >
        <h2 id={headingId} className="text-section font-bold text-ink">{when}</h2>
        <p className="text-label font-semibold text-muted">{cards.length} {cards.length === 1 ? 'card' : 'cards'}</p>
      </div>
      <ul aria-labelledby={headingId} className="mt-1 divide-y divide-line">
        {cards.map(({ card, rating }) => (
          <SummaryCardRow key={card.key} question={card.question} rating={rating} />
        ))}
      </ul>
    </section>
  );
}

function SummaryCardRow({ question, rating }: Readonly<{ question: string; rating: Rating }>) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-inset ${RATINGS[rating].tint}`}>
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
  return (
    <ActionRow>
      <Link to={SETS_PATH} className={primary === 'another-set' ? primaryButton : secondaryButton}>
        Try another set
      </Link>
      <Link to={setPath(setKey)} className={primary === 'back-to-set' ? primaryButton : secondaryButton}>
        Back to the set
      </Link>
    </ActionRow>
  );
}
