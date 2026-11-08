import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { publicSetsQuery, type PublicSet } from '../api/publicContent';
import { HomeLink } from '../components/HeaderLinks';
import { LoadFailed } from '../components/LoadFailed';
import { LoadingScreen, MessageScreen } from '../components/MessageScreen';
import { Screen } from '../components/Screen';
import { setPath } from '../paths';

/** "Browse sets" opens this list. Each set opens its preview, where the trial starts. */
export function SetsPage() {
  const publicSets = useQuery(publicSetsQuery);

  if (publicSets.isPending) {
    return <LoadingScreen text="Loading the sets…" />;
  }
  if (publicSets.isError) {
    return <LoadFailed onRetry={() => void publicSets.refetch()} retrying={publicSets.isFetching} />;
  }
  if (publicSets.data.length === 0) {
    return (
      <MessageScreen title="No sets are available right now.">
        <p>Please check again later.</p>
      </MessageScreen>
    );
  }
  return (
    <Screen top={<HomeLink />}>
      <section className="pt-2">
        <h1 className="text-title font-extrabold tracking-tight">Choose a set</h1>
        <p className="mt-2 text-body text-muted">
          Each set has 5 cards to try. Practice isn’t saved.
        </p>
        <ul className="mt-6 grid gap-3">
          {publicSets.data.map((publicSet) => (
            <li key={publicSet.setKey} className="min-w-0">
              <SetChoice publicSet={publicSet} />
            </li>
          ))}
        </ul>
      </section>
    </Screen>
  );
}

function SetChoice({ publicSet }: { publicSet: PublicSet }) {
  return (
    <Link
      to={setPath(publicSet.setKey)}
      className="pressable flex items-center gap-3 rounded-card bg-surface p-4 shadow-card sm:p-6"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-section font-extrabold tracking-tight">{publicSet.title}</span>
        <span className="mt-1 block text-body text-muted">{publicSet.description}</span>
      </span>
      <ChevronRight aria-hidden="true" size={24} strokeWidth={2} className="shrink-0 text-muted" />
    </Link>
  );
}
