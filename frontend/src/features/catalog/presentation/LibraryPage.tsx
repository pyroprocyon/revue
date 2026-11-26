import { useLocation, useNavigate, useNavigationType, useOutletContext, useSearchParams } from 'react-router';
import { useContext, useEffect, useRef, useState, type RefObject } from 'react';
import type { useSavedSet, useSavedSets } from './useSavedSets';
import type { LibraryRouteData } from './LibraryRoute';
import type { LibraryBrowsing } from './LibraryBrowsingLayout';
import { CreateDeckLink, MyDecks } from './MyDecks';
import type { useDecks } from './useDecks';
import { SavedSets } from './SavedSets';
import { savedSetListParams } from '../../../shared/navigation/paths';
import { routeState } from '../../../shared/navigation/routeState';
import { PageControls } from '../../../shared/ui/PageControls';
import { usePageCursor } from '../../../shared/navigation/usePageCursor';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { LoadingPlaceholder, LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { CollectionStackContext } from './useCollectionLayoutVisible';
import { CollectionLayoutSwitch } from './CollectionLayoutSwitch';

const REMOVAL_NOTICE_MS = 6_000;

export function LibraryPage({ data, showLoading }: Readonly<{ data: LibraryRouteData; showLoading: boolean }>) {
  const profile = useOutletContext<LibraryBrowsing>();
  const { cursor: after, previousPage, nextPage } = usePageCursor();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { group, browsingSet, library, decks, linkedSet } = data;
  const firstPage = after === undefined;
  const { deletedDeckTitle, focusDeletedDeckNotice } = useDeletedDeckNotice(profile, firstPage);
  const savedShelfButton = useRef<HTMLButtonElement>(null);
  const { notice, removed, setRemoved } = useRemovalNotice(savedShelfButton, browsingSet);
  const [stack, setStack] = useState(false);
  const nextCursor = library.data?.nextCursor;
  const counts = library.data?.counts;
  const savedCount = counts ? counts.active + counts.paused : library.data?.items.length;
  const shelf = params.get('shelf');
  const showCollections = showLibraryCollections(shelf, firstPage, library.isFetched, savedCount);
  const createInHeading = firstPage && Boolean(decks.data?.length);
  const nothingFollowsDecks = savedCount === 0 && !removed;
  const defaultToSaved = decks.data?.length === 0 && !deletedDeckTitle;
  const saved = browsingSet || isSavedShelf(shelf, firstPage, showCollections, defaultToSaved);
  const loadingShelf =
    !browsingSet && firstPage && !removed && isLoadingLibraryShelf(shelf, saved, defaultToSaved, decks, library);
  const showLinkedSetNotice = showLoading && linkedSet.loadingDetail;
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
      {loadingShelf && showLoading && (
        <LoadingPlaceholder kind="collection" blue={shelf === 'saved'} stack={stack}>
          Loading your Library…
        </LoadingPlaceholder>
      )}
      {!loadingShelf && (
        <CollectionStackContext value={stack}>
          <div
            className="library-collections loading-reveal"
            data-stack={stack || undefined}
            data-loading-slot={!browsingSet && library.isPending ? 'saved-reviewers' : undefined}
          >
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
                  linkedSet={linkedSet}
                  showLoading={showLoading}
                  detailFeedback={
                    browsingSet && (
                      <SavedSetLoadFeedback
                        selectedSet={linkedSet.selected}
                        unavailable={linkedSet.unavailable}
                        showNotice={showLinkedSetNotice}
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
                  <LibraryPaging
                    after={after}
                    nextCursor={nextCursor}
                    previousPage={previousPage}
                    nextPage={nextPage}
                  />
                )}
              </>
            )}
            {!browsingSet && (
              <LibraryLoadFeedback
                library={library}
                showLoading={showLoading}
                onPrevious={after === undefined ? undefined : previousPage}
              />
            )}
          </div>
        </CollectionStackContext>
      )}
    </WorkspacePage>
  );
}

function isLoadingLibraryShelf(
  shelf: string | null,
  saved: boolean,
  defaultToSaved: boolean,
  decks: ReturnType<typeof useDecks>,
  library: ReturnType<typeof useSavedSets>,
) {
  const savedCountChoosesShelf = shelf === null && defaultToSaved;
  const waitingForSaved = !library.isFetched && library.data === undefined;
  if (waitingForSaved && (shelf === 'saved' || savedCountChoosesShelf)) return true;
  return !saved && !decks.isFetched && decks.data === undefined;
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
  showLoading,
  onPrevious,
}: Readonly<{ library: ReturnType<typeof useSavedSets>; showLoading: boolean; onPrevious?: () => void }>) {
  return (
    <>
      {library.isPending && showLoading && <LoadingStatus>Loading saved reviewers…</LoadingStatus>}
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
