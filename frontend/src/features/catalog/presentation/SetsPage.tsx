import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { PublicSet } from '../application/publicContent';
import { usePublicContentQueries } from './PublicContentProvider';
import { HomeLink, SignInLink } from '../../../shared/ui/HeaderLinks';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { LoadingScreen, MessageScreen } from '../../../shared/ui/MessageScreen';
import { PageLayout } from '../../../shared/ui/PageLayout';
import { setPath } from '../../../shared/navigation/paths';

/** "Browse sets" opens this list. Each set opens its preview, where the trial starts. */
export function SetsPage() {
  const { publicSetsPageQuery } = usePublicContentQueries();
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const previousCursors: (string | undefined)[] = location.state?.previousCursors ?? [];
  const cursor = search.get('after') ?? undefined;
  const publicSets = useQuery(publicSetsPageQuery(cursor));
  function previousPage() {
    const previous = previousCursors.at(-1);
    setSearch(previous === undefined ? {} : { after: previous }, {
      state: { previousCursors: previousCursors.slice(0, -1) },
    });
  }

  if (publicSets.isPending) {
    return <LoadingScreen text="Loading the sets…" />;
  }
  if (publicSets.isError) {
    return <LoadFailed onRetry={() => void publicSets.refetch()} retrying={publicSets.isFetching} />;
  }
  if (publicSets.data.items.length === 0 && cursor === undefined) {
    return (
      <MessageScreen title="No sets are available right now.">
        <p>Check back later.</p>
      </MessageScreen>
    );
  }
  return (
    <PageLayout top={<><HomeLink /><SignInLink /></>}>
      <section className="pt-2">
        <h1 className="text-title font-extrabold tracking-tight">Practice sets</h1>
        <p className="mt-2 text-body text-muted">Choose a set to try 5 cards.</p>
        <div className="mt-4 rounded-inset bg-accent-soft p-4">
          <p className="text-body font-semibold text-accent-strong">Practice only. Nothing is saved.</p>
          <p className="mt-1 text-support text-muted">
            That includes your progress and ratings, even when you’re signed in.
          </p>
        </div>
        <ul className="mt-6 grid gap-3">
          {publicSets.data.items.map((publicSet) => (
            <li key={publicSet.setKey} className="min-w-0">
              <SetChoice publicSet={publicSet} />
            </li>
          ))}
        </ul>
        {publicSets.data.items.length === 0 && <p className="mt-6 text-body text-muted">No more sets are available.</p>}
        {(cursor !== undefined || publicSets.data.nextCursor !== null) && (
          <nav aria-label="Set pages" className="mt-6 flex flex-wrap justify-between gap-3">
            <button type="button" className={`${secondaryButton} disabled:bg-subtle disabled:text-muted disabled:shadow-none`} disabled={cursor === undefined} onClick={previousPage}>Previous</button>
            <button type="button" className={`${secondaryButton} disabled:bg-subtle disabled:text-muted disabled:shadow-none`} disabled={publicSets.data.nextCursor === null} onClick={() => {
              if (publicSets.data.nextCursor === null) return;
              setSearch({ after: publicSets.data.nextCursor }, {
                state: { previousCursors: [...previousCursors, cursor] },
              });
            }}>Next</button>
          </nav>
        )}
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
      <ChevronRight aria-hidden="true" size={24} strokeWidth={2} className="hidden shrink-0 text-muted @min-[20rem]:block" />
    </Link>
  );
}
