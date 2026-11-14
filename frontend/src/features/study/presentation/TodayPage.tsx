import type { ReactNode } from 'react';
import { ArrowRight, CalendarCheck, Layers } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { ReviewFailure, type StudyQueue } from '../application/reviews';
import { useTodayQueue } from './ReviewProvider';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { REVIEW_PATH, SIGN_IN_PATH, TODAY_PATH } from '../../../shared/navigation/paths';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';

export function TodayPage() {
  const query = useTodayQueue();
  if (query.error instanceof ReviewFailure && query.error.kind === 'signed-out') {
    return <Navigate to={`${SIGN_IN_PATH}?returnTo=${TODAY_PATH}`} replace />;
  }
  let content: ReactNode;
  if (query.isPending) {
    content = <output>Loading your review…</output>;
  } else if (query.isError) {
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
  } else {
    content = <TodayContent queue={query.data} />;
  }
  const panel = <div className="rounded-card bg-surface p-compact-gutter py-6 shadow-card sm:p-8 lg:p-10">{content}</div>;
  return <WorkspacePage title="Your review">{query.isPending ? <WhenSlow>{panel}</WhenSlow> : panel}</WorkspacePage>;
}

export function reviewAction(count: number) {
  if (count >= 5) return 'Start with 5';
  return `Review ${count} ${count === 1 ? 'card' : 'cards'}`;
}

export function nextReviewText(date: string) {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(parsed);
}

function TodayContent({ queue }: Readonly<{ queue: StudyQueue }>) {
  const ready = queue.dueCards + queue.newCards;
  if (ready > 0)
    return (
      <>
        <span className="mb-6 grid size-14 place-items-center rounded-control bg-accent-soft text-accent">
          <Layers aria-hidden="true" className="size-7" />
        </span>
        <h2 className="text-title font-bold tracking-tight">
          {ready} {ready === 1 ? 'card' : 'cards'} ready
        </h2>
        <p className="mt-3 text-body text-muted">
          {queue.dueCards} due · {queue.newCards} new
        </p>
        <Link to={REVIEW_PATH} className={`${primaryButton} mt-8 inline-flex gap-3`}>
          {reviewAction(ready)}
          <ArrowRight aria-hidden="true" className="size-5" />
        </Link>
      </>
    );
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
      {!empty && !unavailable && queue.nextReviewDate && (
        <p className="mt-4 text-label font-semibold text-accent">Next review: {nextReviewText(queue.nextReviewDate)}</p>
      )}
    </>
  );
}

function emptyStateText(queue: StudyQueue) {
  if (queue.totalCards === 0)
    return {
      title: 'No cards to review yet',
      description: 'Your study cards will appear here when they’re available.',
    };
  if (queue.availableCards === 0)
    return {
      title: 'No cards available right now',
      description: 'Your Library’s cards aren’t currently available to study.',
    };
  return { title: 'All caught up', description: 'Your saved progress is ready for your next visit.' };
}
