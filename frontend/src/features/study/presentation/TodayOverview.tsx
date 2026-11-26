import { useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import { CalendarCheck, CalendarDays, ChevronDown, Check, Layers, Minus, PartyPopper } from 'lucide-react';
import { Link } from 'react-router';
import { ContinueReview } from './ContinueReview';
import { TodayReviewCard } from './TodayReviewCard';
import type { ReviewTopic, StudyDay, StudyQueue } from '../application/reviews';
import type { useTodayOverview } from './ReviewProvider';
import { REVIEW_TIME_ZONE, REVIEW_TIME_ZONE_OFFSET } from '../../../shared/product/studyRules';
import { cardNoun } from '../../../shared/ui/cardCount';
import { blueAccentButton, primaryButton } from '../../../shared/ui/buttonStyles';
import { LIBRARY_PATH, NEW_DECK_PATH, reviewTopicPath } from '../../../shared/navigation/paths';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { nextReviewText, reviewAction, statusPanel } from './reviewPresentation';

const weekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: REVIEW_TIME_ZONE });

export function TodayOverview({
  query,
  overview,
  username,
  pausedTopic,
}: Readonly<{
  query: ReturnType<typeof useTodayOverview>['query'];
  overview: StudyQueue;
  username: string;
  pausedTopic: string | null;
}>) {
  const [finished, setFinished] = useState(false);
  const { studyDays = [], topics = [] } = overview;
  const otherTopics = topics.filter((topic) => topic.id !== pausedTopic);
  return (
    <div className="loading-reveal space-y-4">
      <StudyRhythm days={studyDays} />
      <div className="min-w-0 space-y-4">
        {pausedTopic && !finished ? (
          <ContinueReview
            query={query}
            onFinished={() => setFinished(true)}
            username={username}
            topic={pausedTopic}
            fallback={<TodayTopics queue={overview} />}
            otherReviews={otherTopics.length > 0 && <NextTopic topics={otherTopics} />}
          />
        ) : (
          <TodayTopics queue={overview} />
        )}
      </div>
    </div>
  );
}

function TodayTopics({ queue }: Readonly<{ queue: StudyQueue }>) {
  const topics = queue.topics ?? [];
  if (topics.length > 0) return <NextTopic topics={topics} />;
  const canStartNewCards = queue.newCards > 0;
  const newCardLimitReached = !canStartNewCards && (queue.unintroducedCards ?? 0) > 0;
  if (queue.availableCards > 0 && queue.dueCards === 0 && !newCardLimitReached && queue.studyDays?.at(-1)?.studied) {
    return <TodayCelebration canStartNewCards={canStartNewCards} nextReviewDate={queue.nextReviewDate} />;
  }
  return (
    <div className={statusPanel}>
      <TodayContent queue={queue} />
    </div>
  );
}

function TodayCelebration({
  canStartNewCards,
  nextReviewDate,
}: Readonly<{ canStartNewCards: boolean; nextReviewDate: string | null }>) {
  const heading = useId();
  return (
    <section
      aria-labelledby={heading}
      className="grid justify-items-center gap-2 rounded-card border border-line bg-linear-to-br from-saved-set-soft to-surface to-80% px-4 py-6 text-center wrap-anywhere shadow-control short-phone:py-4 sm:px-6"
    >
      <span className="mb-1.5 grid size-15 place-items-center rounded-full border border-saved-set/20 bg-surface text-saved-set short-phone:size-12">
        <PartyPopper aria-hidden="true" className="size-6" />
      </span>
      <h2 id={heading} className="text-2xl leading-tight font-extrabold tracking-tight short-phone:text-section">
        Nice work today!
      </h2>
      <p className="text-base text-pretty text-muted">
        {canStartNewCards
          ? 'Scheduled reviews complete. Start new cards if you’d like.'
          : 'Today’s reviews are complete.'}
      </p>
      {canStartNewCards && (
        <Link to={LIBRARY_PATH} className={`${blueAccentButton} mt-2`}>
          Open Library
        </Link>
      )}
      {!canStartNewCards && nextReviewDate && (
        <p className="mt-2 grid w-full max-w-64 gap-0.5 rounded-control border border-saved-set/20 bg-surface px-3 py-3.5">
          <span className="text-label font-medium text-muted">Next review</span>
          <time dateTime={nextReviewDate} className="text-lg leading-tight font-bold">
            {nextReviewText(nextReviewDate)}
          </time>
        </p>
      )}
    </section>
  );
}

function StudyRhythm({ days }: Readonly<{ days: readonly StudyDay[] }>) {
  const studiedCount = days.filter((day) => day.studied).length;
  if (studiedCount === 0) return null;
  const dayLabel = studiedCount === 1 ? 'day' : 'days';
  return (
    <section
      aria-label="Study rhythm"
      className="rounded-card border border-line bg-accent-soft p-compact-gutter sm:p-6"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-support font-semibold text-muted">Past 7 days</p>
          <h2 className="text-section font-extrabold tracking-tight">
            {studiedCount} {dayLabel} studied
          </h2>
        </div>
        <CalendarDays aria-hidden="true" className="size-9 rounded-inset bg-surface/70 p-2 text-accent-strong" />
      </div>
      <ol aria-label="Recent study days" className="study-week mt-4">
        {days.map((day, index) => {
          const isToday = index === days.length - 1;
          const dayName = weekday.format(new Date(`${day.date}T00:00:00${REVIEW_TIME_ZONE_OFFSET}`));
          const Icon = day.studied ? Check : Minus;
          return (
            <li
              key={day.date}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${nextReviewText(day.date)}, ${day.studied ? 'studied' : 'no reviews'}`}
            >
              <span aria-hidden="true" className="grid justify-items-center gap-1 text-xs font-semibold text-muted">
                {isToday ? 'Today' : dayName.slice(0, 2)}
                <span
                  className={`study-marker ${day.studied ? 'bg-study-day-complete text-on-study-day-complete' : 'bg-surface text-muted'}`}
                >
                  <Icon size={15} strokeWidth={day.studied ? 2.75 : 2} />
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function NextTopic({ topics }: Readonly<{ topics: readonly ReviewTopic[] }>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pickerId = useId();
  const startLink = useRef<HTMLAnchorElement>(null);
  const requestFocus = useContext(FocusRequestContext);
  const currentTopic = topics.find((topic) => topic.id === selectedId) ?? topics[0];
  const alternatives = topics.filter((topic) => topic.id !== currentTopic.id);

  useLayoutEffect(() => {
    if (selectedId !== null) requestFocus(startLink.current);
  }, [selectedId, requestFocus]);

  return (
    <TodayReviewCard
      kind="next"
      title={currentTopic.title}
      detail={`${currentTopic.dueCards} ${cardNoun(currentTopic.dueCards)} due`}
      to={reviewTopicPath(currentTopic.id)}
      action={reviewAction(currentTopic.dueCards)}
      linkRef={startLink}
    >
      {alternatives.length > 0 && (
        <details className="group/picker mt-3 border-t border-line @min-[34rem]:ml-12">
          <summary className="pressable flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-control px-1 py-2 text-label font-semibold text-saved-set @min-[34rem]:pl-0 [&::-webkit-details-marker]:hidden">
            Other topics
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open/picker:rotate-180" />
          </summary>
          <ul aria-label="Review topics" className="divide-y divide-line border-t border-line">
            {alternatives.map((topic) => (
              <li key={topic.id}>
                <button
                  type="button"
                  aria-labelledby={`${pickerId}-${topic.id}-title`}
                  aria-describedby={`${pickerId}-${topic.id}-due`}
                  className="pressable flex min-h-12 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control px-1 py-2 text-left text-label font-semibold wrap-anywhere @min-[34rem]:pl-0"
                  onClick={() => setSelectedId(topic.id)}
                >
                  <span id={`${pickerId}-${topic.id}-title`} className="min-w-0">
                    {topic.title}
                  </span>
                  <span
                    id={`${pickerId}-${topic.id}-due`}
                    className="shrink-0 text-support font-medium text-muted tabular-nums"
                  >
                    {topic.dueCards} due
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </TodayReviewCard>
  );
}

function TodayContent({ queue }: Readonly<{ queue: StudyQueue }>) {
  const empty = queue.totalCards === 0;
  const unavailable = !empty && queue.availableCards === 0;
  const Icon = empty || unavailable ? Layers : CalendarCheck;
  const text = emptyStateText(queue);
  return (
    <>
      <span className="mb-5 grid size-12 place-items-center rounded-control bg-accent-soft text-accent">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-section font-bold">{text.title}</h2>
      <p className="mt-3 text-body text-muted">{text.description}</p>
      {!empty && !unavailable && queue.newCards === 0 && queue.nextReviewDate && (
        <p className="mt-4 text-label font-semibold text-accent">Next review: {nextReviewText(queue.nextReviewDate)}</p>
      )}
      {empty && (
        <Link to={NEW_DECK_PATH} className={`${primaryButton} mt-6`}>
          Create a deck
        </Link>
      )}
      {queue.newCards > 0 && (
        <Link to={LIBRARY_PATH} className={`${primaryButton} mt-6`}>
          Open Library
        </Link>
      )}
    </>
  );
}

function emptyStateText(queue: StudyQueue) {
  if (queue.totalCards === 0)
    return {
      title: 'No cards to review yet',
      description: 'Make your own cards for a class or exam. They will appear here to review.',
    };
  if (queue.availableCards === 0)
    return {
      title: 'No cards available right now',
      description: 'Your Library’s cards aren’t currently available to study.',
    };
  if (queue.newCards > 0)
    return {
      title: 'No cards due today',
      description: 'Open a deck or saved reviewer in Library to start its new cards.',
    };
  if ((queue.unintroducedCards ?? 0) > 0)
    return {
      title: 'All caught up',
      description: 'You’ve reached today’s new-card limit. You can start more new cards tomorrow.',
    };
  return { title: 'All caught up', description: 'Your saved progress is ready for your next visit.' };
}
