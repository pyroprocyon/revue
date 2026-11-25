import { useLocation, useNavigate, useNavigationType, useOutletContext, useSearchParams } from 'react-router';
import { useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { LibraryFailure, type ReviewGroup } from '../application/library';
import { useSavedSet, useSavedSets } from './useSavedSets';
import type { LibraryBrowsing } from './LibraryBrowsingLayout';
import { CreateDeckLink, MyDecks } from './MyDecks';
import { useDecks } from './useDecks';
import { SavedSets } from './SavedSets';
import { LIBRARY_PATH, isPositiveLongId, savedSetListParams } from '../../../shared/navigation/paths';
import { SessionExpiredRedirect } from '../../../shared/navigation/SessionExpiredRedirect';
import { routeState } from '../../../shared/navigation/routeState';
import { PageControls } from '../../../shared/ui/PageControls';
import { usePageCursor } from '../../../shared/navigation/usePageCursor';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { useFirstLoadNotice } from '../../../shared/ui/useFirstLoadNotice';
import { LoadingPlaceholder, LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { CollectionStackContext } from './useCollectionLayoutVisible';
import { CollectionLayoutSwitch } from './CollectionLayoutSwitch';

const REMOVAL_NOTICE_MS = 6_000;

export function LibraryPage() {
  const profile = useOutletContext<LibraryBrowsing>();
  const { cursor: after, previousPage, nextPage } = usePageCursor();
  const [params, setParams] = useSearchParams();
  const { group, browsingSet, library, decks, linkedSet, signedOut } = useLibraryRouteData(
    profile.username,
    params,
    after,
  );
  const firstPage = after === undefined;
  const { deletedDeckTitle, focusDeletedDeckNotice } = useDeletedDeckNotice(profile, firstPage);
  const savedShelfButton = useRef<HTMLButtonElement>(null);
  const { notice, removed, setRemoved } = useRemovalNotice(savedShelfButton, browsingSet);
  const location = useLocation();
  const [stack, setStack] = useState(false);
  const nextCursor = library.data?.nextCursor;
  const counts = library.data?.counts;
  const savedCount = counts ? counts.active + counts.paused : library.data?.items.length;
  const shelf = params.get('shelf');
  const showCollections = showLibraryCollections(shelf, firstPage, library.isFetched, savedCount);
  const createInHeading = firstPage && Boolean(decks.data?.length);
  const nothingFollowsDecks = savedCount === 0 && !removed;
  const saved =
    browsingSet || isSavedShelf(shelf, firstPage, showCollections, decks.data?.length === 0 && !deletedDeckTitle);
  const firstLoad = useLibraryFirstLoad(browsingSet, linkedSet.loading, firstPage && !removed, decks, library);
  if (signedOut) {
    return <SessionExpiredRedirect returnTo={LIBRARY_PATH + location.search} />;
  }
  if (firstLoad.library) {
    return (
      <WorkspacePage title="Library" focusHeading={!focusDeletedDeckNotice}>
        {firstLoad.notice && (
          <LoadingPlaceholder kind="collection" blue={params.get('shelf') === 'saved'} stack={stack}>
            Loading your Library…
          </LoadingPlaceholder>
        )}
      </WorkspacePage>
    );
  }
  function chooseShelf(value: string) {
    const next = new URLSearchParams();
    next.set('shelf', value);
    if (group === 'paused') next.set('setStatus', group);
    setParams(next, { replace: true });
  }
  function showRemoval(title: string, restoreFocus: boolean) {
    setRemoved({ title, restoreFocus });
    setParams(savedSetListParams(params), {
      replace: true,
      state: { previousCursors: routeState(location).previousCursors },
    });
  }
  return (
    <WorkspacePage
      title={browsingSet ? undefined : 'Library'}
      headingAction={!browsingSet && (createInHeading || saved) && <CreateDeckLink />}
      focusHeading={!focusDeletedDeckNotice}
      headerControls={
        !browsingSet && (
          <CollectionControls
            showCollections={showCollections}
            savedPageSize={library.data?.items.length ?? 0}
            saved={saved}
            stack={stack}
            onShelfChange={chooseShelf}
            onStackChange={setStack}
            savedButton={savedShelfButton}
            deckCount={decks.data?.length}
            savedCount={counts || firstPage ? savedCount : undefined}
            hasMore={!counts && Boolean(nextCursor)}
          />
        )
      }
    >
      <CollectionStackContext value={stack}>
        <div className="library-collections" data-stack={stack || undefined}>
          {!saved && (
            <MyDecks
              decks={decks}
              fillsScreen={nothingFollowsDecks || showCollections}
              deletedDeckTitle={deletedDeckTitle}
              focusDeletedDeckNotice={focusDeletedDeckNotice}
            />
          )}
          {!browsingSet && removed && (
            <output
              ref={notice}
              tabIndex={-1}
              className="mb-6 block rounded-control bg-accent-soft p-compact-gutter text-support text-accent-strong wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Removed “{removed.title}” from your Library. Your progress is kept.
            </output>
          )}
          {saved && (library.data || browsingSet || library.isError) && (
            <>
              <SavedSets
                sets={library.data?.items}
                detail={firstLoad.notice ? undefined : linkedSet.detail}
                linkedId={linkedSet.id}
                detailFeedback={
                  browsingSet && (
                    <SavedSetLoadFeedback
                      selectedSet={linkedSet.selected}
                      unavailable={linkedSet.unavailable}
                      showNotice={firstLoad.notice}
                    />
                  )
                }
                loading={library.isPlaceholderData}
                group={group}
                counts={counts}
                username={profile.username}
                paginated={Boolean(after || nextCursor)}
                onRemoved={showRemoval}
              />
              {!browsingSet && !library.isPlaceholderData && !library.isError && (
                <LibraryPaging after={after} nextCursor={nextCursor} previousPage={previousPage} nextPage={nextPage} />
              )}
            </>
          )}
          {!browsingSet && (
            <LibraryLoadFeedback library={library} onPrevious={after === undefined ? undefined : previousPage} />
          )}
        </div>
      </CollectionStackContext>
    </WorkspacePage>
  );
}

function useLibraryRouteData(username: string, params: URLSearchParams, after: string | undefined) {
  const group: ReviewGroup = params.get('setStatus') === 'paused' ? 'paused' : 'active';
  const linkedId = params.get('shelf') === 'saved' ? params.get('set') : null;
  const browsingSet = linkedId !== null;
  const library = useSavedSets(username, after, group, !browsingSet);
  const decks = useDecks(username, after === undefined && !browsingSet);
  const linkedSet = useLinkedSavedSet(username, linkedId, library);
  const error = browsingSet ? linkedSet.selected.error : library.error;
  const signedOut = error instanceof LibraryFailure && error.reason === 'signed-out';
  return { group, browsingSet, library, decks, linkedSet, signedOut };
}

function useLinkedSavedSet(username: string, id: string | null, library: ReturnType<typeof useSavedSets>) {
  const listed = library.isPlaceholderData ? undefined : library.data?.items.find((set) => set.id === id);
  const validId = id !== null && isPositiveLongId(id);
  const needsDetail = validId && !listed;
  const selected = useSavedSet(username, id ?? '', needsDetail);
  return {
    id: validId ? id : undefined,
    selected,
    detail: listed ?? selected.data,
    loading: needsDetail && selected.isPending,
    unavailable: !validId || (selected.error instanceof LibraryFailure && selected.error.reason === 'unavailable'),
  };
}

function useLibraryFirstLoad(
  browsingSet: boolean,
  loadingSet: boolean,
  firstPage: boolean,
  decks: ReturnType<typeof useDecks>,
  library: ReturnType<typeof useSavedSets>,
) {
  const loadingLibrary =
    !browsingSet && firstPage && [decks, library].some((query) => !query.isFetched && query.data === undefined);
  const notice = useFirstLoadNotice(loadingSet || loadingLibrary);
  return { notice, library: !browsingSet && (loadingLibrary || notice) };
}

function SavedSetLoadFeedback({
  selectedSet,
  unavailable,
  showNotice,
}: Readonly<{
  selectedSet: ReturnType<typeof useSavedSet>;
  unavailable: boolean;
  showNotice: boolean;
}>) {
  if (unavailable)
    return (
      <p role="alert" className="text-muted">
        This reviewer is no longer in your Library.
      </p>
    );
  if (showNotice)
    return (
      <LoadingPlaceholder kind="rows" blue>
        Loading the saved reviewer…
      </LoadingPlaceholder>
    );
  if (!selectedSet.isError) return null;
  return (
    <>
      <p role="alert" className="mb-4 text-muted">
        This saved reviewer couldn’t load. Check your connection and try again.
      </p>
      <button
        type="button"
        className={secondaryButton}
        onClick={() => void selectedSet.refetch()}
        disabled={selectedSet.isFetching}
      >
        {selectedSet.isFetching ? 'Retrying…' : 'Retry saved reviewer'}
      </button>
    </>
  );
}

function LibraryPaging({
  after,
  nextCursor,
  previousPage,
  nextPage,
}: Readonly<{
  after?: string;
  nextCursor?: string | null;
  previousPage: () => void;
  nextPage: (cursor: string) => void;
}>) {
  if (after === undefined && !nextCursor) return null;
  return (
    <PageControls
      label="Library pages"
      onPrevious={after === undefined ? undefined : previousPage}
      onNext={nextCursor ? () => nextPage(nextCursor) : undefined}
    />
  );
}

function showLibraryCollections(shelf: string | null, firstPage: boolean, fetched: boolean, savedCount?: number) {
  return !firstPage || (savedCount === undefined ? fetched && shelf === 'saved' : savedCount > 0);
}

function isSavedShelf(shelf: string | null, firstPage: boolean, showCollections: boolean, defaultToSaved: boolean) {
  if (!firstPage) return true;
  if (!showCollections) return false;
  return shelf ? shelf === 'saved' : defaultToSaved;
}

type CollectionControlsProps = {
  showCollections: boolean;
  savedPageSize: number;
  saved: boolean;
  stack: boolean;
  onShelfChange: (shelf: string) => void;
  onStackChange: (stack: boolean) => void;
  savedButton: RefObject<HTMLButtonElement | null>;
  deckCount?: number;
  savedCount?: number;
  hasMore: boolean;
};

function CollectionControls({
  showCollections,
  savedPageSize,
  saved,
  stack,
  onShelfChange,
  onStackChange,
  savedButton,
  deckCount,
  savedCount,
  hasMore,
}: Readonly<CollectionControlsProps>) {
  const showLayout = saved ? savedPageSize > 1 : Boolean(deckCount);
  if (!showCollections && !showLayout) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 @min-[64rem]/workspace:border-b @min-[64rem]/workspace:border-line">
      {showCollections && (
        <fieldset className="collection-switch">
          <legend className="sr-only">Library collections</legend>
          <button type="button" className="pressable" aria-pressed={!saved} onClick={() => onShelfChange('mine')}>
            <span>My decks</span>
            {deckCount !== undefined && <span className="collection-count">{deckCount}</span>}
          </button>
          <button
            type="button"
            ref={savedButton}
            className="pressable"
            data-saved=""
            aria-pressed={saved}
            onClick={() => onShelfChange('saved')}
          >
            <span>Saved</span>
            {savedCount !== undefined && (
              <span className="collection-count">
                {savedCount}
                {hasMore ? '+' : ''}
              </span>
            )}
          </button>
        </fieldset>
      )}
      {showLayout && <CollectionLayoutSwitch stack={stack} onChange={onStackChange} />}
    </div>
  );
}

function useRemovalNotice(savedShelfButton: Readonly<{ current: HTMLButtonElement | null }>, browsingSet: boolean) {
  const [removed, setRemoved] = useState<{ title: string; restoreFocus: boolean } | null>(null);
  const notice = useRef<HTMLOutputElement>(null);
  const requestFocus = useContext(FocusRequestContext);
  useEffect(() => {
    if (!removed || browsingSet) return;
    if (removed.restoreFocus) requestFocus(notice.current);
    const timer = window.setTimeout(() => {
      if (document.activeElement === notice.current) {
        requestFocus(savedShelfButton.current ?? notice.current?.closest('main') ?? null);
      }
      setRemoved(null);
    }, REMOVAL_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [removed, browsingSet, requestFocus, savedShelfButton]);
  return { notice, removed, setRemoved };
}

function LibraryLoadFeedback({
  library,
  onPrevious,
}: Readonly<{ library: ReturnType<typeof useSavedSets>; onPrevious?: () => void }>) {
  return (
    <>
      {library.isPending && (
        <WhenSlow>
          <LoadingStatus>Loading saved reviewers…</LoadingStatus>
        </WhenSlow>
      )}
      {library.isError && (
        <div className={library.data ? 'mt-4' : undefined}>
          <p role="alert" className="mb-4 text-muted">
            {library.data
              ? 'Your saved reviewers couldn’t refresh. Check your connection and try again.'
              : 'Your saved reviewers couldn’t load. Check your connection and try again.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={secondaryButton}
              onClick={() => void library.refetch()}
              disabled={library.isFetching}
            >
              {library.isFetching ? 'Retrying…' : 'Retry saved reviewers'}
            </button>
            {onPrevious && (
              <button type="button" className={secondaryButton} onClick={onPrevious}>
                Previous
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function useDeletedDeckNotice(profile: LibraryBrowsing, firstPage: boolean) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const arrivedFromDeletion = firstPage ? routeState(location).deletedDeckTitle : undefined;
  const [deletion, setDeletion] = useState(
    () =>
      arrivedFromDeletion && {
        title: arrivedFromDeletion,
        focus: navigationType === 'REPLACE',
        search: profile.search,
        deckGroup: profile.deckGroup,
      },
  );
  if (deletion && (profile.search !== deletion.search || profile.deckGroup !== deletion.deckGroup))
    setDeletion(undefined);
  // Browsers keep history state across reloads and Back, so the deletion is confirmed only on arrival.
  useEffect(() => {
    if (routeState(location).deletedDeckTitle === undefined) return;
    void navigate(location, { replace: true, state: { ...routeState(location), deletedDeckTitle: undefined } });
  }, [location, navigate]);
  const deletedDeckTitle = deletion ? deletion.title : undefined;
  const focusDeletedDeckNotice = deletion ? deletion.focus : false;
  return { deletedDeckTitle, focusDeletedDeckNotice };
}
