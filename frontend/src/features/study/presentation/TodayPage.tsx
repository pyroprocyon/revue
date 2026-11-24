import { useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarCheck, CalendarDays, Clock3, Check, Layers, Minus } from 'lucide-react';
import { Link, Navigate, useOutletContext } from 'react-router';
import { ContinueReview } from './ContinueReview';
import { TopicIcon } from './TopicIcon';
import { pausedReview } from './pausedReview';
import { type ReviewTopic, type StudyDay, type StudyQueue } from '../application/reviews';
import { useTodayOverview } from './ReviewProvider';
import { REVIEW_BATCH_SIZE, REVIEW_TIME_ZONE, REVIEW_TIME_ZONE_OFFSET } from '../../../shared/product/studyRules';
import { cardNoun } from '../../../shared/ui/cardCount';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { LIBRARY_PATH, NEW_DECK_PATH, TODAY_PATH, reviewTopicPath, signInPath } from '../../../shared/navigation/paths';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';

export const statusPanel = 'rounded-card bg-surface p-compact-gutter py-6 shadow-control sm:p-8';
const weekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: REVIEW_TIME_ZONE });

export function TodayPage() {
  const { username } = useOutletContext<{ username: string }>();
  const [pausedTopic] = useState(() => pausedReview(username));
  const [finished, setFinished] = useState(false);
  const { query, overview, loading, signedOut } = useTodayOverview(pausedTopic);
  if (signedOut) return <Navigate to={signInPath(TODAY_PATH)} replace />;
  if (overview) {
    const { studyDays = [], topics = [] } = overview;
    return (
      <WorkspacePage title="Your review">
        <div className="review-overview grid items-start gap-4">
          <div className="@container/today min-w-0 space-y-4">
            {pausedTopic && !finished ? (
              <ContinueReview
                query={query}
                onFinished={() => setFinished(true)}
                username={username}
                topic={pausedTopic}
                fallback={<TodayTopics queue={overview} />}
                otherReviews={
                  topics.some((topic) => topic.id !== pausedTopic) ? (
                    <NextTopic topics={topics.filter((topic) => topic.id !== pausedTopic)} />
                  ) : null
                }
              />
            ) : (
              <TodayTopics queue={overview} />
            )}
          </div>
          <StudyRhythm days={studyDays} />
        </div>
      </WorkspacePage>
    );
  }
  let content: ReactNode;
  if (loading) {
    content = (
      <WhenSlow>
        <output>Loading your review…</output>
      </WhenSlow>
    );
  } else {
    content = (
      <div>
        <p role="alert">Your review couldn’t load. Try again.</p>
        <button
          type="button"
          disabled={query.isFetching}
          className={`${primaryButton} mt-4`}
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }
  const panel = (
    <div aria-busy={loading} className={loading ? `${statusPanel} min-h-32` : statusPanel}>
      {content}
    </div>
  );
  return <WorkspacePage title="Your review">{panel}</WorkspacePage>;
}

function TodayTopics({ queue }: Readonly<{ queue: StudyQueue }>) {
  const topics = queue.topics ?? [];
  return topics.length > 0 ? (
    <NextTopic topics={topics} />
  ) : (
    <div className={statusPanel}>
      <TodayContent queue={queue} />
    </div>
  );
}

export function reviewAction(count: number) {
  if (count >= REVIEW_BATCH_SIZE) return `Start with ${REVIEW_BATCH_SIZE}`;
  return `Review ${count} ${cardNoun(count)}`;
}

export function nextReviewText(date: string) {
  const parsed = new Date(`${date}T00:00:00${REVIEW_TIME_ZONE_OFFSET}`);
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: REVIEW_TIME_ZONE,
  }).format(parsed);
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
                  className={`study-marker ${day.studied ? 'bg-study-day-complete text-on-accent' : 'bg-surface text-muted'}`}
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
  const headingId = useId();
  const topicTitleId = useId();
  const startLink = useRef<HTMLAnchorElement>(null);
  const requestFocus = useContext(FocusRequestContext);
  const currentTopic = topics.find((topic) => topic.id === selectedId) ?? topics[0];

  useLayoutEffect(() => {
    if (selectedId !== null) requestFocus(startLink.current);
  }, [selectedId, requestFocus]);

  return (
    <section aria-labelledby={headingId}>
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-control">
        <div className="collection-cover">
          <div className="flex items-center justify-between gap-3">
            <h2 id={headingId} className="flex items-center gap-2 text-support font-semibold">
              <Clock3 aria-hidden="true" size={16} /> Up next
            </h2>
            <TopicIcon topic={currentTopic.id} />
          </div>
          <h3 id={topicTitleId} className="mt-5 text-title font-extrabold tracking-tight wrap-anywhere">
            {currentTopic.title}
          </h3>
          <p className="mt-1 text-support">
            {currentTopic.dueCards} {cardNoun(currentTopic.dueCards)} due
          </p>
        </div>
        <div className="p-3">
          <Link
            to={reviewTopicPath(currentTopic.id)}
            ref={startLink}
            aria-describedby={topicTitleId}
            className={`${primaryButton} w-full`}
          >
            {reviewAction(currentTopic.dueCards)} <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </div>
      {topics.length > 1 && (
        <details className="mt-2">
          <summary className="pressable mx-auto min-h-12 w-fit cursor-pointer rounded-control px-3 py-3 text-label font-semibold text-accent sm:mx-0">
            Other topics
          </summary>
          <fieldset className="today-topic-options mt-2 grid min-w-0 gap-2 @min-[38rem]:grid-cols-2">
            <legend className="sr-only">Review topics</legend>
            {topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                aria-pressed={topic.id === currentTopic.id}
                aria-labelledby={`${headingId}-${topic.id}-title`}
                aria-describedby={`${headingId}-${topic.id}-due`}
                className="pressable flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control bg-surface px-4 py-2 text-left text-label font-semibold wrap-anywhere shadow-control aria-pressed:bg-accent-soft aria-pressed:text-accent-strong"
                onClick={() => {
                  if (topic.id === selectedId) requestFocus(startLink.current);
                  else setSelectedId(topic.id);
                }}
              >
                <span id={`${headingId}-${topic.id}-title`} className="min-w-0">
                  {topic.title}
                </span>
                <span
                  id={`${headingId}-${topic.id}-due`}
                  className="shrink-0 text-support font-medium text-muted tabular-nums"
                >
                  {topic.dueCards} due
                </span>
              </button>
            ))}
          </fieldset>
        </details>
      )}
    </section>
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
      description: 'Open a deck or saved set in Library to start its new cards.',
    };
  if ((queue.unintroducedCards ?? 0) > 0)
    return {
      title: 'All caught up',
      description: 'You’ve reached today’s new-card limit. You can start more new cards tomorrow.',
    };
  return { title: 'All caught up', description: 'Your saved progress is ready for your next visit.' };
}
