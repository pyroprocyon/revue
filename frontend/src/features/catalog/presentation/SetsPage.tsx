import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicSet } from '../application/publicContent';
import { usePublicContentQueries } from './PublicContentProvider';
import { AccountHeaderLink, HomeLink } from '../../../shared/ui/HeaderLinks';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { LoadingScreen, MessageScreen } from '../../../shared/ui/MessageScreen';
import { PageLayout } from '../../../shared/ui/PageLayout';
import { PageControls } from '../../../shared/ui/PageControls';
import { usePageCursor } from '../../../shared/navigation/usePageCursor';
import { setPath } from '../../../shared/navigation/paths';

/** "Browse sets" opens this list. Each set opens its preview, where the trial starts. */
export function SetsPage() {
  const { publicSetsPageQuery } = usePublicContentQueries();
  const { cursor, previousPage, nextPage } = usePageCursor();
  const publicSets = useQuery(publicSetsPageQuery(cursor));

  if (publicSets.isPending) {
    return <LoadingScreen text="Loading the sets…" />;
  }
  if (publicSets.isError) {
    return (
      <LoadFailed
        onRetry={() => void publicSets.refetch()}
        retrying={publicSets.isFetching}
        recoveryAction={cursor !== undefined && (
          <button type="button" className={secondaryButton} onClick={previousPage}>Previous</button>
        )}
      />
    );
  }
  if (publicSets.data.items.length === 0 && cursor === undefined) {
    return (
      <MessageScreen title="No sets are available right now.">
        <p>Check back later.</p>
      </MessageScreen>
    );
  }
  const { items, nextCursor } = publicSets.data;
  return (
    <PageLayout top={<><HomeLink /><AccountHeaderLink /></>}>
      <section className="pt-2">
        <h1 className="text-title font-extrabold tracking-tight">Shared sets</h1>
        <p className="mt-2 text-body text-muted">Try a five-card practice session.</p>
        <ul className="mt-6 grid gap-3">
          {items.map((publicSet) => (
            <li key={publicSet.setKey} className="min-w-0">
              <SetChoice publicSet={publicSet} />
            </li>
          ))}
        </ul>
        {items.length === 0 && <p className="mt-6 text-body text-muted">No more sets are available.</p>}
        {(cursor !== undefined || nextCursor !== null) && (
          <PageControls
            label="Set pages"
            onPrevious={cursor === undefined ? undefined : previousPage}
            onNext={nextCursor ? () => nextPage(nextCursor) : undefined}
          />
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
