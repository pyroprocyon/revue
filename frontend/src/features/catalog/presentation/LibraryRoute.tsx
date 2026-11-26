import { useLocation, useOutletContext, useSearchParams } from 'react-router';
import { LibraryFailure, type ReviewGroup } from '../application/library';
import { useDecks, useSavedSetCards } from './useDecks';
import { savedReviewerCardQuery, useSavedSet, useSavedSets } from './useSavedSets';
import type { LibraryBrowsing } from './LibraryBrowsingLayout';
import { pageModule } from '../../../shared/navigation/usePageModule';
import { LIBRARY_PATH, isPositiveLongId } from '../../../shared/navigation/paths';
import { SessionExpiredRedirect } from '../../../shared/navigation/SessionExpiredRedirect';
import { LoadingPlaceholder } from '../../../shared/ui/LoadingFeedback';
import { useFirstLoadNotice } from '../../../shared/ui/useFirstLoadNotice';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';

const { usePageModule: useLibraryPage, preload: preloadLibraryPage } = pageModule(() =>
  import('./LibraryPage').then(({ LibraryPage }) => LibraryPage),
);
const { usePageModule: useSavedReviewerBrowser, preload: preloadSavedSetBrowser } = pageModule(() =>
  import('./SavedSetBrowser').then(({ SavedSetBrowser }) => SavedSetBrowser),
);

export { preloadLibraryPage, preloadSavedSetBrowser };

export type LibraryRouteData = ReturnType<typeof useLibraryRouteData>;

export function LibraryRoute() {
  const { username } = useOutletContext<LibraryBrowsing>();
  const [params] = useSearchParams();
  const location = useLocation();
  const after = params.get('after') ?? undefined;
  const data = useLibraryRouteData(username, params, after);
  const view = useLibraryPage();
  const waitingForShelves =
    !data.browsingSet && (data.library.isPending || (after === undefined && data.decks.isPending));
  const showLoading = useFirstLoadNotice(!view || waitingForShelves || data.linkedSet.loading);
  if (data.signedOut) return <SessionExpiredRedirect returnTo={LIBRARY_PATH + location.search} />;
  if (view) {
    if ('error' in view) throw view.error;
    const LibraryPage = view.component;
    return <LibraryPage data={data} showLoading={showLoading} />;
  }
  const loadingMessage = data.browsingSet ? 'Loading the saved reviewer…' : 'Loading your Library…';
  return (
    <WorkspacePage title={data.browsingSet ? undefined : 'Library'} focusHeading={false}>
      {showLoading && (
        <LoadingPlaceholder kind={data.browsingSet ? 'rows' : 'collection'} blue={params.get('shelf') === 'saved'}>
          {loadingMessage}
        </LoadingPlaceholder>
      )}
    </WorkspacePage>
  );
}

function useLibraryRouteData(username: string, params: URLSearchParams, after: string | undefined) {
  const group: ReviewGroup = params.get('setStatus') === 'paused' ? 'paused' : 'active';
  const linkedId = params.get('shelf') === 'saved' ? params.get('set') : null;
  const browsingSet = linkedId !== null;
  const library = useSavedSets(username, after, group, !browsingSet);
  const decks = useDecks(username, after === undefined && !browsingSet);
  const linkedSet = useLinkedSavedSet(username, linkedId, library, savedReviewerCardQuery(params));
  const error = browsingSet ? linkedSet.selected.error : library.error;
  const signedOut = error instanceof LibraryFailure && error.reason === 'signed-out';
  return { group, browsingSet, library, decks, linkedSet, signedOut };
}

function useLinkedSavedSet(
  username: string,
  id: string | null,
  library: ReturnType<typeof useSavedSets>,
  cardQuery: ReturnType<typeof savedReviewerCardQuery>,
) {
  const listed = library.isPlaceholderData ? undefined : library.data?.items.find((set) => set.id === id);
  const validId = id !== null && isPositiveLongId(id);
  const needsDetail = validId && !listed;
  const selected = useSavedSet(username, id ?? '', needsDetail);
  const browser = useSavedReviewerBrowser(validId);
  const cards = useSavedSetCards(username, id ?? '', cardQuery, validId);
  const detail = listed ?? selected.data;
  const loadingDetail = needsDetail && selected.isPending;
  return {
    selected,
    detail,
    browser,
    cards,
    loadingDetail,
    loading: loadingDetail || (detail !== undefined && (browser === undefined || cards.isPending)),
    unavailable: !validId || (selected.error instanceof LibraryFailure && selected.error.reason === 'unavailable'),
  };
}
