import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { useTodayOverview } from './ReviewProvider';
import { pausedReview } from './pausedReview';
import { statusPanel } from './reviewPresentation';
import { pageModule } from '../../../shared/navigation/usePageModule';
import { TODAY_PATH } from '../../../shared/navigation/paths';
import { SessionExpiredRedirect } from '../../../shared/navigation/SessionExpiredRedirect';
import { LoadingPlaceholder } from '../../../shared/ui/LoadingFeedback';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { useFirstLoadNotice } from '../../../shared/ui/useFirstLoadNotice';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';

const { usePageModule: useTodayOverviewModule, preload: loadTodayOverview } = pageModule(() =>
  import('./TodayOverview').then(({ TodayOverview }) => TodayOverview),
);

export { loadTodayOverview };

export function TodayPage() {
  const { username } = useOutletContext<{ username: string }>();
  const [pausedTopic] = useState(() => pausedReview(username));
  const { query, overview, loading, signedOut } = useTodayOverview(pausedTopic);
  const view = useTodayOverviewModule();
  const waiting = overview ? view === undefined : loading;
  const showLoading = useFirstLoadNotice(waiting);
  if (signedOut) return <SessionExpiredRedirect returnTo={TODAY_PATH} />;
  if (overview && view) {
    if ('error' in view) throw view.error;
    const TodayOverview = view.component;
    return (
      <WorkspacePage title="Your review">
        <TodayOverview query={query} overview={overview} username={username} pausedTopic={pausedTopic} />
      </WorkspacePage>
    );
  }
  return (
    <WorkspacePage title="Your review">
      {waiting ? (
        showLoading && <LoadingPlaceholder kind="today">Loading your review…</LoadingPlaceholder>
      ) : (
        <div className={statusPanel}>
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
      )}
    </WorkspacePage>
  );
}
