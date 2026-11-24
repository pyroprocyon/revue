import { SaveSetAction } from './SaveSetAction';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CollectionIcon } from '../../../shared/ui/CollectionIcon';
import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { PublicSet } from '../application/publicContent';
import { usePublicContentQueries } from './PublicContentProvider';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { TRIAL_CARD_COUNT } from '../../../shared/product/studyRules';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { FactLine } from '../../../shared/ui/FactLine';
import { AllSetsLink, BackButton, HomeLink } from '../../../shared/ui/HeaderLinks';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { LoadingScreen, MessageScreen } from '../../../shared/ui/MessageScreen';
import { ActionRow } from '../../../shared/ui/LayoutParts';
import { PageLayout } from '../../../shared/ui/PageLayout';
import { ShareLinks } from '../../../shared/ui/ShareLinks';
import { routeState } from '../../../shared/navigation/routeState';
import { LIBRARY_PATH, SETS_PATH, setSharePath, trialPath } from '../../../shared/navigation/paths';

/** One set's preview at /sets/:setKey, the page a classmate's shared link opens. */
export function SetPage() {
  const { publicSetQuery, publicSetsQuery } = usePublicContentQueries();
  const { setKey = '', shareCode } = useParams();
  const queryClient = useQueryClient();
  const publicSet = useQuery({
    ...publicSetQuery(shareCode ?? setKey, shareCode === undefined ? 'key' : 'share'),
    // Coming from the set list, the summary is already known, so the page shows it at once.
    placeholderData: () =>
      queryClient
        .getQueryData(publicSetsQuery.queryKey)
        ?.items.find((set) => (shareCode === undefined ? set.setKey === setKey : set.shareCode === shareCode)),
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
  const fromLibrary = routeState(useLocation()).fromLibrary === true;
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
    <div className="grid gap-4">
      <div className={publicSet.saveAllowed ? 'grid items-start gap-3 @min-[26rem]:grid-cols-2' : undefined}>
        <TrialAction publicSet={publicSet} />
        {publicSet.saveAllowed && (
          <SaveSetAction key={publicSet.setKey} shareCode={publicSet.shareCode} setKey={publicSet.setKey} />
        )}
      </div>
      <details className="border-t border-line">
        <summary className="min-h-12 cursor-pointer content-center text-label font-semibold text-accent">
          Share set
        </summary>
        <ShareLinks title={publicSet.title} path={setSharePath(publicSet.shareCode)} />
      </details>
    </div>
  );
  const top = (
    <>
      {fromLibrary ? <BackButton label="Library" fallbackPath={LIBRARY_PATH} /> : <HomeLink />}
      <AllSetsLink />
    </>
  );
  return (
    <div className="lg:[--container-page:46rem]">
      <PageLayout top={top}>
        <article className="mt-3 overflow-hidden rounded-card border border-line bg-surface shadow-control">
          <div className="collection-cover">
            <p className="flex items-center gap-2 text-support font-semibold">
              <CollectionIcon kind="saved" />
              {publicSet.saveAllowed ? 'Shared set' : 'Practice set'}
            </p>
            <h1 className="mt-4 text-title font-extrabold tracking-tight wrap-anywhere">{publicSet.title}</h1>
          </div>
          <div className="px-compact-gutter pb-4 sm:p-6">
            <p className="mt-2 text-body text-muted lg:mt-3 lg:max-w-[54ch] lg:text-lg">{publicSet.description}</p>
            <FactLine
              facts={[
                `Published by ${publicSet.publisherName}`,
                'Not yet checked',
                cardCountLabel(publicSet.cardCount),
              ]}
              className="pt-6 text-support font-medium lg:mt-6 lg:border-t lg:border-line lg:pt-4 lg:text-muted"
            />
            {publicSet.trialAvailable && (
              <p id="trial-save-note" className="mt-2 text-support text-muted">
                Trial progress and ratings aren’t saved.
              </p>
            )}
            <div className="mt-4">{actions}</div>
          </div>
        </article>
      </PageLayout>
    </div>
  );
}

function TrialAction({ publicSet }: Readonly<{ publicSet: PublicSet }>) {
  const className = `${primaryButton} w-full`;
  const label = `Try ${TRIAL_CARD_COUNT} cards`;
  if (!publicSet.trialAvailable) {
    return (
      <div>
        <button type="button" disabled className={className}>
          {label}
        </button>
        <p className="mt-2 text-support text-muted">
          The trial needs {TRIAL_CARD_COUNT} cards, and this set has {cardCountLabel(publicSet.cardCount)} right now.
        </p>
      </div>
    );
  }
  return (
    <div>
      <Link to={trialPath(publicSet.setKey)} className={className} aria-describedby="trial-save-note">
        {label}
        <ArrowRight aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />
      </Link>
    </div>
  );
}
