import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import type { PublicSet } from '../application/publicContent';
import { usePublicContentQueries } from './PublicContentProvider';
import { chip, primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { FactLine } from '../../../shared/ui/FactLine';
import { AllSetsLink, HomeLink } from '../../../shared/ui/HeaderLinks';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { LoadingScreen, MessageScreen } from '../../../shared/ui/MessageScreen';
import { ActionRow, Screen } from '../../../shared/ui/Screen';
import { ShareLinks } from '../../../shared/ui/ShareLinks';
import { SETS_PATH, setSharePath, trialPath } from '../../../shared/navigation/paths';

/** One set's preview at /sets/:setKey, the page a classmate's shared link opens. */
export function SetPage() {
  const { publicSetQuery, publicSetsQuery } = usePublicContentQueries();
  const { setKey = '', shareCode } = useParams();
  const queryClient = useQueryClient();
  const publicSet = useQuery({
    ...publicSetQuery(shareCode ?? setKey, shareCode === undefined ? 'key' : 'share'),
    // Coming from the set list, the summary is already known, so the page shows it at once.
    placeholderData: () => queryClient.getQueryData(publicSetsQuery.queryKey)?.items.find((set) => shareCode === undefined ? set.setKey === setKey : set.shareCode === shareCode),
  });

  if (publicSet.isPending) {
    return <LoadingScreen text="Loading the set…" />;
  }
  if (publicSet.isError) {
    return <LoadFailed onRetry={() => void publicSet.refetch()} retrying={publicSet.isFetching} />;
  }
  if (publicSet.data === null) {
    const allSetsButton = (
      <ActionRow>
        <Link to={SETS_PATH} className={secondaryButton}>
          See all sets
        </Link>
      </ActionRow>
    );
    return (
      <MessageScreen title="This set isn't available right now." action={allSetsButton}>
        <p>Check back later.</p>
      </MessageScreen>
    );
  }
  return <SetDetails publicSet={publicSet.data} />;
}

function SetDetails({ publicSet }: Readonly<{ publicSet: PublicSet }>) {
  const { trialCardsQuery } = usePublicContentQueries();
  const queryClient = useQueryClient();

  // Visitors usually try the cards next, so load them now and the trial opens without waiting.
  useEffect(() => {
    if (publicSet.trialAvailable) {
      void queryClient.query(trialCardsQuery(publicSet.setKey)).catch(() => {
        // The trial owns error feedback when the visitor opens it.
      });
    }
  }, [queryClient, publicSet.setKey, publicSet.trialAvailable, trialCardsQuery]);

  const actions = (
    <div className="grid gap-3 lg:flex lg:flex-wrap lg:items-start lg:justify-between lg:gap-4">
      <TrialAction publicSet={publicSet} />
      <ShareLinks title={publicSet.title} path={setSharePath(publicSet.shareCode)} />
    </div>
  );
  const top = (
    <>
      <HomeLink />
      <AllSetsLink />
    </>
  );
  return (
    <div className="lg:[--container-page:46rem]">
      <Screen top={top} actions={actions}>
        <article className="mt-2 flex flex-col rounded-card bg-surface p-4 shadow-card sm:p-6 lg:mt-8 lg:p-8">
          <p className={`${chip} self-start`}>Shared set</p>
          <h1 className="mt-3 text-title font-extrabold tracking-tight text-balance lg:text-title-lg">{publicSet.title}</h1>
          <p className="mt-2 text-body text-muted lg:mt-3 lg:max-w-[54ch] lg:text-lg">{publicSet.description}</p>
          <FactLine
            facts={[`Published by ${publicSet.publisherName}`, 'Not yet checked', cardCountLabel(publicSet.cardCount)]}
            className="pt-6 text-support font-medium lg:mt-6 lg:border-t lg:border-line lg:pt-4 lg:text-muted"
          />
        </article>
      </Screen>
    </div>
  );
}

function TrialAction({ publicSet }: Readonly<{ publicSet: PublicSet }>) {
  const className = `${primaryButton} w-full sm:w-auto lg:min-h-14 lg:gap-3 lg:px-6 lg:text-lg`;
  if (!publicSet.trialAvailable) {
    return (
      <div>
        <button type="button" disabled className={className}>
          Try 5 cards
        </button>
        <p className="mt-2 text-support text-muted">
          The trial needs 5 cards, and this set has {cardCountLabel(publicSet.cardCount)} right now.
        </p>
      </div>
    );
  }
  return (
    <div>
      <Link to={trialPath(publicSet.setKey)} className={className}>
        Try 5 cards
        <ArrowRight aria-hidden="true" size={20} strokeWidth={2} />
      </Link>
    </div>
  );
}

/** A non-breaking space keeps the number and "cards" on the same line. */
function cardCountLabel(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`;
}
