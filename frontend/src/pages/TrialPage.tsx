import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { demoCardsQuery, type DemoCard, type DemoCards } from '../api/publicContent';
import { primaryButton, secondaryButton } from '../components/buttonStyles';
import { BackButton } from '../components/HeaderLinks';
import { LoadFailed } from '../components/LoadFailed';
import { LoadingScreen, MessageScreen } from '../components/MessageScreen';
import { ActionRow, Screen } from '../components/Screen';
import { SETS_PATH, setPath } from '../paths';
import { FlashCard } from '../trial/FlashCard';
import { RATINGS, RecallMeter, type Rating } from '../trial/ratings';

// When a signed-in account would show a new card again after each rating. The trial saves nothing
// and only describes it; later gaps depend on the student's own history.
const REVIEW_WINDOWS: { when: string; ratings: Rating[] }[] = [
  { when: 'Tomorrow', ratings: ['again', 'hard'] },
  { when: 'In a few days', ratings: ['good'] },
  { when: 'In a week or more', ratings: ['easy'] },
];

/** "Try 5 cards": a set's first five cards, practiced in the browser and never saved. */
export function TrialPage() {
  const { setKey = '' } = useParams();
  const demoCards = useQuery(demoCardsQuery(setKey));

  if (demoCards.isPending) {
    return <LoadingScreen text="Loading the cards…" />;
  }
  if (demoCards.isError) {
    return <LoadFailed onRetry={() => void demoCards.refetch()} retrying={demoCards.isFetching} />;
  }
  if (demoCards.data === null) {
    return (
      <MessageScreen
        title="The 5-card trial isn't available right now."
        action={<SetLinks setKey={setKey} primary="back-to-set" />}
      >
        <p>Please check again later, or choose another set.</p>
      </MessageScreen>
    );
  }
  return <Trial setKey={setKey} demoCards={demoCards.data} />;
}

function Trial({ setKey, demoCards }: { setKey: string; demoCards: DemoCards }) {
  // One rating per card practiced so far, so the next card is the one at that position.
  const [ratings, setRatings] = useState<Rating[]>([]);
  const cardCount = demoCards.cards.length;
  const cardIndex = ratings.length;

  if (cardIndex === cardCount) {
    return <TrialFinished setKey={setKey} cards={demoCards.cards} ratings={ratings} />;
  }
  const card = demoCards.cards[cardIndex];

  function rate(rating: Rating) {
    setRatings([...ratings, rating]);
  }

  const top = (
    <>
      <BackButton label={demoCards.setTitle} fallbackPath={setPath(setKey)} />
      <p aria-live="polite" className="ml-auto shrink-0 text-support text-muted">
        Card {cardIndex + 1} of {cardCount}
      </p>
    </>
  );
  return (
    <Screen top={top}>
      <h1 className="sr-only">Try {cardCount} cards</h1>
      <TrialProgress position={cardIndex + 1} cardCount={cardCount} />
      {/* A new key per card, so each card starts on its front instead of turning back over. */}
      <FlashCard key={card.key} card={card} publisherName={demoCards.publisherName} onRate={rate} />
    </Screen>
  );
}

function TrialProgress({ position, cardCount }: { position: number; cardCount: number }) {
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
  cards: DemoCard[];
  ratings: Rating[];
};

/** The end of the trial: each card with its rating and when an account would show it again. */
function TrialFinished({ setKey, cards, ratings }: TrialFinishedProps) {
  const reviewedCards = cards.map((card, index) => ({ card, rating: ratings[index] }));
  const groups = REVIEW_WINDOWS.map((timing) => ({
    when: timing.when,
    cards: reviewedCards.filter(({ rating }) => timing.ratings.includes(rating)),
  })).filter((group) => group.cards.length > 0);
  const finishedIcon = (
    <span className="mb-3 grid size-10 place-items-center rounded-full bg-accent-soft text-accent-strong">
      <Check aria-hidden="true" size={22} strokeWidth={2.5} />
    </span>
  );
  return (
    <MessageScreen
      title={`You practiced ${cards.length} cards.`}
      icon={finishedIcon}
      action={<SetLinks setKey={setKey} primary="another-set" />}
    >
      <p>Example timing, soonest first.</p>
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
  card: DemoCard;
  rating: Rating;
};

type ReviewTimingGroupProps = {
  when: string;
  cards: ReviewedCard[];
  first: boolean;
};

function ReviewTimingGroup({ when, cards, first }: ReviewTimingGroupProps) {
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

function SummaryCardRow({ question, rating }: { question: string; rating: Rating }) {
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
  /** Which link gets the primary look: after a trial, trying another set comes first. */
  primary: 'another-set' | 'back-to-set';
};

function SetLinks({ setKey, primary }: SetLinksProps) {
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
