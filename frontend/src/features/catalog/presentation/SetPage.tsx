import { SaveSetAction } from './SaveSetAction';
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ArrowRight, Layers2 } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { PublicSet, PublicSetPage } from '../application/publicContent';
import {
  canRecheckTrial,
  publicCatalogRetry,
  publicContentKeys,
  trialConflictsWithPreview,
} from '../application/publicContentQueries';
import { usePublicContentQueries } from './PublicContentProvider';
import { ReviewerSubjectIcon } from './ReviewerSubjectIcon';
import { blueAccentButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { TRIAL_CARD_COUNT } from '../../../shared/product/studyRules';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { FactLine } from '../../../shared/ui/FactLine';
import { AllSetsLink, BackButton, HomeLink } from '../../../shared/ui/HeaderLinks';
import { LoadFailed } from '../../../shared/ui/LoadFailed';
import { LoadingPlaceholder } from '../../../shared/ui/LoadingFeedback';
import { MessageScreen } from '../../../shared/ui/MessageScreen';
import { ActionRow } from '../../../shared/ui/LayoutParts';
import { PageLayout } from '../../../shared/ui/PageLayout';
import { ShareLinks } from '../../../shared/ui/ShareLinks';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { routeState } from '../../../shared/navigation/routeState';
import { LIBRARY_PATH, PUBLISHED_PATH, SETS_PATH, setSharePath, trialPath } from '../../../shared/navigation/paths';

/** One set's preview at /sets/:setKey, the page a classmate's shared link opens. */
export function SetPage() {
  const { publicSetQuery, onboardingSetsQuery } = usePublicContentQueries();
  const { setKey = '', shareCode } = useParams();
  const { fromPublished } = routeState(useLocation());
  const queryClient = useQueryClient();
  const previewQuery = publicSetQuery(shareCode ?? setKey, shareCode === undefined ? 'key' : 'share');
  const publicSet = useQuery({
    ...previewQuery,
    // Coming from the set list, the summary is already known, so the page shows it at once.
    placeholderData: () => {
      const sets = fromPublished
        ? queryClient
            .getQueriesData<InfiniteData<PublicSetPage>>({ queryKey: publicContentKeys.topics })
            .flatMap(([, catalog]) => catalog?.pages.flatMap((page) => page.items) ?? [])
        : queryClient.getQueryData(onboardingSetsQuery.queryKey);
      const match = sets?.find((set) =>
        shareCode === undefined ? set.setKey === setKey : set.shareCode === shareCode,
      );
      return match && { value: match, started: 0, finished: 0 };
    },
  });

  if (publicSet.isLoadingError) {
    return <LoadFailed onRetry={() => void publicSet.refetch()} retrying={publicSet.isFetching} />;
  }
  if (publicSet.data?.value === null) {
    const allSetsButton = (
      <ActionRow>
        {fromPublished ? (
          <BackButton label="Back" fallbackPath={PUBLISHED_PATH} />
        ) : (
          <Link to={SETS_PATH} className={secondaryButton}>
            See all reviewers
          </Link>
        )}
      </ActionRow>
    );
    return (
      <MessageScreen title="This reviewer isn't available right now." action={allSetsButton}>
        <p>Check back later.</p>
      </MessageScreen>
    );
  }
  return (
    <div className="reviewer-preview">
      <PageLayout top={<SetPreviewNavigation />}>
        {publicSet.isPending ? (
          <WhenSlow>
            <LoadingPlaceholder kind="preview" blue className="mt-3">
              Loading the reviewer…
            </LoadingPlaceholder>
          </WhenSlow>
        ) : (
          <SetDetails
            publicSet={publicSet.data.value}
            previewKey={previewQuery.queryKey[1]}
            previewStarted={publicSet.data.started}
            previewFinished={publicSet.data.finished}
          />
        )}
      </PageLayout>
    </div>
  );
}

function SetPreviewNavigation() {
  const { fromLibrary, fromPublished } = routeState(useLocation());
  if (fromPublished) return <BackButton label="Back" fallbackPath={PUBLISHED_PATH} />;
  return (
    <>
      {fromLibrary ? <BackButton label="Library" fallbackPath={LIBRARY_PATH} /> : <HomeLink />}
      <AllSetsLink />
    </>
  );
}

function SetDetails({
  publicSet,
  previewKey,
  previewStarted,
  previewFinished,
}: Readonly<{ publicSet: PublicSet; previewKey: string; previewStarted: number; previewFinished: number }>) {
  const { trialCardsQuery } = usePublicContentQueries();
  const trial = useQuery({
    ...trialCardsQuery(publicSet.setKey),
    enabled: publicSet.trialAvailable,
    ...publicCatalogRetry,
    refetchOnWindowFocus: false,
  });
  const trialRead = trial.data;
  const previewIsNewer = trialRead !== undefined && trialRead.finished < previewStarted;
  const sampleQuestion = publicSet.sampleQuestion;
  const conflictingRead =
    publicSet.trialAvailable &&
    !previewIsNewer &&
    trialRead !== undefined &&
    trialConflictsWithPreview(trialRead, previewFinished, publicSet);
  const cachedQuestion = trialRead?.value?.cards?.[0]?.question;
  const question =
    previewIsNewer || conflictingRead || trialRead === undefined ? (sampleQuestion ?? cachedQuestion) : cachedQuestion;
  const trialAvailable = publicSet.trialAvailable && (previewIsNewer || trialRead?.value !== null);
  const showSample = trialAvailable && (trial.isPending || Boolean(question));
  const refetchTrial = trial.refetch;
  const recheckTrial = conflictingRead && trial.fetchStatus === 'idle' && canRecheckTrial(trial.error, previewFinished);
  const checkingTrial = publicSet.trialAvailable && (trial.isPending || trial.isFetching || recheckTrial);
  useEffect(() => {
    if (recheckTrial) void refetchTrial({ cancelRefetch: false });
  }, [recheckTrial, refetchTrial]);

  return (
    <article
      className="set-detail mt-3"
      data-published={publicSet.saveAllowed || undefined}
      data-loading-slot={checkingTrial ? 'trial-availability' : undefined}
    >
      <header className="set-detail-header">
        <p className="flex items-center gap-2 text-support font-semibold text-saved-set">
          <ReviewerSubjectIcon subject={publicSet.subject} />
          {publicSet.saveAllowed ? 'Reviewer' : 'Practice only'}
        </p>
        <h1 className="mt-3 text-title font-extrabold tracking-tight wrap-anywhere">{publicSet.title}</h1>
        <FactLine
          facts={[`Published by ${publicSet.publisherName}`, cardCountLabel(publicSet.cardCount)]}
          className="mt-1.5 text-support font-medium text-muted"
        />
        {publicSet.description && <p className="mt-3 max-w-[54ch] text-body text-muted">{publicSet.description}</p>}
      </header>
      {showSample && (
        <section className="set-detail-sample">
          <h2 className="flex items-center gap-2 text-support font-semibold text-saved-set">
            <Layers2 aria-hidden="true" className="size-4 shrink-0" />
            Sample question
          </h2>
          {question ? (
            <p className="loading-reveal mt-2 text-section font-bold whitespace-pre-wrap wrap-anywhere">{question}</p>
          ) : (
            <div data-loading-slot="sample" className="mt-2 flex min-h-[1lh] items-center text-section">
              <WhenSlow>
                <span className="loading-bar" data-loading-indicator aria-hidden="true" />
                <output className="sr-only">Loading the sample question…</output>
              </WhenSlow>
            </div>
          )}
        </section>
      )}
      <div className="set-detail-actions">
        {!trialAvailable && (
          <p id="trial-unavailable-note" className="pt-1 pb-3 text-support text-muted">
            {publicSet.trialAvailable
              ? 'This trial is unavailable right now.'
              : `The trial needs ${TRIAL_CARD_COUNT} cards, and this reviewer has ${cardCountLabel(publicSet.cardCount)} right now.`}
          </p>
        )}
        <div className="border-t border-line">
          <ShareLinks key={publicSet.shareCode} title={publicSet.title} path={setSharePath(publicSet.shareCode)} />
        </div>
      </div>
      <fieldset className="set-detail-study">
        <legend className="sr-only">Reviewer actions</legend>
        <TrialAction setKey={publicSet.setKey} available={trialAvailable} previewKey={previewKey} />
        {publicSet.saveAllowed && (
          <div className="min-h-12">
            <SaveSetAction key={publicSet.setKey} shareCode={publicSet.shareCode} setKey={publicSet.setKey} />
          </div>
        )}
      </fieldset>
    </article>
  );
}

function TrialAction({
  setKey,
  available,
  previewKey,
}: Readonly<{ setKey: string; available: boolean; previewKey: string }>) {
  const { fromPublished } = routeState(useLocation());
  const className = `${blueAccentButton} w-full`;
  const label = `Try ${TRIAL_CARD_COUNT} cards`;
  if (!available) {
    return (
      <button type="button" disabled className={className} aria-describedby="trial-unavailable-note">
        {label}
      </button>
    );
  }
  return (
    <Link to={trialPath(setKey)} state={{ fromPublished, trialPreviewKey: previewKey }} className={className}>
      {label}
      <ArrowRight aria-hidden="true" size={20} strokeWidth={2} className="shrink-0" />
    </Link>
  );
}
