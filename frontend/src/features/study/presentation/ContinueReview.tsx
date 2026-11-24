import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { ReviewFailure } from '../application/reviews';
import { TodayReviewCard } from './TodayReviewCard';
import type { useTodayQueue } from './ReviewProvider';
import { forgetReview } from './pausedReview';
import { reviewTopicPath, signInPath, TODAY_PATH } from '../../../shared/navigation/paths';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { LoadingStatus } from '../../../shared/ui/LoadingFeedback';

export function ContinueReview({
  username,
  topic,
  query,
  fallback,
  otherReviews,
  onFinished,
}: Readonly<{
  username: string;
  topic: string;
  fallback: ReactNode;
  otherReviews: ReactNode;
  query: ReturnType<typeof useTodayQueue>;
  onFinished: () => void;
}>) {
  const summary = query.data?.continuation;
  const remaining = summary ? summary.dueCards + summary.newCards : 0;
  const unfinished = summary ? summary.dueCards + (summary.unintroducedCards ?? summary.newCards) : 0;

  useEffect(() => {
    if (query.isSuccess && !query.isFetching && unfinished === 0) {
      forgetReview(username, topic);
      onFinished();
    }
  }, [query.isSuccess, query.isFetching, unfinished, username, topic, onFinished]);

  if (query.error instanceof ReviewFailure && query.error.kind === 'signed-out') {
    return <Navigate replace to={signInPath(TODAY_PATH)} />;
  }
  if (query.isError && remaining === 0) {
    return (
      <>
        <div className="rounded-card bg-surface p-compact-gutter shadow-control sm:p-6">
          <p role="alert">Your unfinished review couldn’t load. Try again.</p>
          <button className={`${primaryButton} mt-4`} onClick={() => void query.refetch()} disabled={query.isFetching}>
            Try again
          </button>
        </div>
        {otherReviews}
      </>
    );
  }
  if (query.isPending || (query.isFetching && remaining === 0)) {
    return (
      <>
        <WhenSlow>
          <LoadingStatus>Checking your remaining cards…</LoadingStatus>
        </WhenSlow>
        {otherReviews}
      </>
    );
  }
  if (remaining === 0) return fallback;

  return (
    <>
      <TodayReviewCard
        kind="continue"
        title={summary?.topicTitle}
        detail={`${remaining} ${remaining === 1 ? 'card remains' : 'cards remain'}.`}
        to={reviewTopicPath(topic, true)}
        action="Continue"
      />
      {otherReviews}
    </>
  );
}
