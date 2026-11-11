import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicSet } from '../application/publicContent';
import { usePublicContentQueries } from './PublicContentProvider';
import { HomeLink, SignInLink } from '../../../shared/ui/HeaderLinks';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { LoadingScreen, MessageScreen } from '../../../shared/ui/MessageScreen';
import { Screen } from '../../../shared/ui/Screen';
import { setPath } from '../../../shared/navigation/paths';

/** "Browse sets" opens this list. Each set opens its preview, where the trial starts. */
export function SetsPage() {
  const { publicSetsQuery } = usePublicContentQueries();
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
        <p>Check back later.</p>
      </MessageScreen>
    );
  }
  return (
    <Screen top={<><HomeLink /><SignInLink /></>}>
      <section className="pt-2">
        <h1 className="text-title font-extrabold tracking-tight">Practice sets</h1>
        <p className="mt-2 text-body text-muted">Choose a set to try 5 cards.</p>
        <div className="mt-4 rounded-inset bg-highlight-soft p-4">
          <p className="text-body font-semibold text-ink">Practice only. Nothing is saved.</p>
          <p className="mt-1 text-support text-muted">
            That includes your progress and ratings, even when you’re signed in.
          </p>
        </div>
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
