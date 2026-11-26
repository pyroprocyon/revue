import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicSet } from '../application/publicContent';
import { usePublicContentQueries } from './PublicContentProvider';
import { AccountHeaderLink, HomeLink } from '../../../shared/ui/HeaderLinks';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { MessageScreen } from '../../../shared/ui/MessageScreen';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { LoadingPlaceholder } from '../../../shared/ui/LoadingFeedback';
import { PageLayout } from '../../../shared/ui/PageLayout';
import { setPath } from '../../../shared/navigation/paths';

/** "Browse reviewers" opens this list. Each set opens its preview, where the trial starts. */
export function SetsPage() {
  const { onboardingSetsQuery } = usePublicContentQueries();
  const publicSets = useQuery(onboardingSetsQuery);
  const top = (
    <>
      <HomeLink />
      <AccountHeaderLink />
    </>
  );

  if (publicSets.isError) {
    return <LoadFailed onRetry={() => void publicSets.refetch()} retrying={publicSets.isFetching} />;
  }
  if (publicSets.data?.length === 0) {
    return (
      <MessageScreen title="No reviewers are available right now.">
        <p>Check back later.</p>
      </MessageScreen>
    );
  }
  const items = publicSets.data ?? [];
  return (
    <PageLayout top={top}>
      <section className="pt-2">
        <h1 className="text-title font-extrabold tracking-tight">Reviewers</h1>
        <p className="mt-2 text-body text-muted">Try a five-card practice session.</p>
        {publicSets.isPending && (
          <WhenSlow>
            <LoadingPlaceholder kind="rows" blue className="mt-6">
              Loading reviewers…
            </LoadingPlaceholder>
          </WhenSlow>
        )}
        <ul aria-busy={publicSets.isPending} className={`mt-6 grid gap-3 ${items.length > 0 ? 'loading-reveal' : ''}`}>
          {items.map((publicSet) => (
            <li key={publicSet.setKey} className="min-w-0">
              <SetChoice publicSet={publicSet} />
            </li>
          ))}
        </ul>
      </section>
    </PageLayout>
  );
}

function SetChoice({ publicSet }: Readonly<{ publicSet: PublicSet }>) {
  return (
    <Link
      to={setPath(publicSet.setKey)}
      className="pressable flex items-center gap-3 rounded-card bg-surface p-compact-gutter shadow-card sm:p-6"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-section font-extrabold tracking-tight">{publicSet.title}</span>
        <span className="mt-1 block text-body text-muted">{publicSet.description}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        size={24}
        strokeWidth={2}
        className="hidden shrink-0 text-muted @min-[20rem]:block"
      />
    </Link>
  );
}
