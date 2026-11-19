import { useEffect, useId, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import { ReviewFailure } from '../application/reviews';
import { ArrowRight } from 'lucide-react';
import type { useTodayQueue } from './ReviewProvider';
import { forgetReview } from './pausedReview';
import { TopicIcon } from './TopicIcon';
import { reviewTopicPath, signInPath, TODAY_PATH } from '../../../shared/navigation/paths';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';

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
  const titleId = useId();
  const topicId = useId();
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
  if (query.isError) {
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
  if (query.isPending || query.isFetching) {
    return (
      <>
        <WhenSlow>
          <output>Checking your remaining cards…</output>
        </WhenSlow>
        {otherReviews}
      </>
    );
  }
  if (remaining === 0) return fallback;

  return (
    <>
      <section aria-labelledby={titleId}>
        <h2 id={titleId} className="mb-3 text-section font-bold">
          Continue review
        </h2>
        <div className="today-next-card @container rounded-card bg-surface p-compact-gutter shadow-control sm:p-6">
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <TopicIcon topic={topic} />
            <div id={topicId} className="min-w-0">
              <h3 className="text-body font-bold wrap-anywhere sm:text-section">{summary?.topicTitle}</h3>
              <p className="text-support text-muted">
                {remaining} {remaining === 1 ? 'card remains' : 'cards remain'}.
              </p>
            </div>
          </div>
          <Link
            to={reviewTopicPath(topic, true)}
            aria-describedby={topicId}
            className={`${primaryButton} w-full @min-[38rem]:w-auto`}
          >
            <span className="min-w-0 wrap-anywhere">Continue</span>
            <ArrowRight aria-hidden="true" className="hidden size-5 shrink-0 @min-[12rem]:block" />
          </Link>
        </div>
      </section>
      {otherReviews}
    </>
  );
}
