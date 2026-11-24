import { Navigate, useLocation, useNavigate, useNavigationType, useOutletContext, useSearchParams } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { LibraryFailure } from '../application/library';
import { useSavedSets } from './useSavedSets';
import type { LibraryBrowsing } from './LibraryBrowsingLayout';
import { CreateDeckLink, MyDecks } from './MyDecks';
import { useDecks } from './useDecks';
import { SavedSets } from './SavedSets';
import { LIBRARY_PATH, signInPath } from '../../../shared/navigation/paths';
import { routeState } from '../../../shared/navigation/routeState';
import { PageControls } from '../../../shared/ui/PageControls';
import { usePageCursor } from '../../../shared/navigation/usePageCursor';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';

export function LibraryPage() {
  const profile = useOutletContext<LibraryBrowsing>();
  const { cursor: after, previousPage, nextPage } = usePageCursor();
  const library = useSavedSets(profile.username, after);
  const firstPage = after === undefined;
  const { deletedDeckTitle, focusDeletedDeckNotice } = useDeletedDeckNotice(profile, firstPage);
  const decks = useDecks(profile.username, firstPage);
  const [removed, setRemoved] = useState<{ title: string; restoreFocus: boolean } | null>(null);
  const notice = useRef<HTMLOutputElement>(null);
  const [params, setParams] = useSearchParams();
  const [stack, setStack] = useState(false);
  useEffect(() => {
    if (removed?.restoreFocus && document.activeElement === document.body) notice.current?.focus();
  }, [removed]);
  if (library.error instanceof LibraryFailure && library.error.reason === 'signed-out') {
    return <Navigate replace to={signInPath(LIBRARY_PATH)} />;
  }
  const nextCursor = library.data?.nextCursor;
  const hasSavedSets = (library.data?.items.length ?? 0) > 0;
  const createInHeading = firstPage && decks.isSuccess && decks.data.length > 0;
  const nothingFollowsDecks = library.isSuccess && !hasSavedSets && !removed;
  const shelf = params.get('shelf');
  const saved =
    !firstPage ||
    (shelf === 'saved' && hasSavedSets) ||
    (!shelf && hasSavedSets && decks.isSuccess && decks.data.length === 0 && !deletedDeckTitle);
  const showCollections = hasSavedSets || !firstPage;
  const showLayout = saved ? (library.data?.items.length ?? 0) > 1 && !params.get('set') : Boolean(decks.data?.length);
  function chooseShelf(value: string) {
    const next = new URLSearchParams();
    next.set('shelf', value);
    setParams(next, { replace: true });
  }
  return (
    <WorkspacePage
      title="Library"
      headingAction={(createInHeading || saved) && <CreateDeckLink />}
      focusHeading={!focusDeletedDeckNotice}
    >
      <div className="library-collections" data-stack={stack || undefined}>
        {(showCollections || showLayout) && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 border-b border-line">
            {showCollections && (
              <fieldset className="collection-switch">
                <legend className="sr-only">Library collections</legend>
                <button type="button" aria-pressed={!saved} onClick={() => chooseShelf('mine')}>
                  My decks {decks.data?.length}
                </button>
                <button type="button" data-saved="" aria-pressed={saved} onClick={() => chooseShelf('saved')}>
                  Saved sets {firstPage && library.data && `${library.data.items.length}${nextCursor ? '+' : ''}`}
                </button>
              </fieldset>
            )}
            {showLayout && (
              <fieldset className="collection-layout ml-auto hidden @min-[64rem]/workspace:flex">
                <legend className="sr-only">Collection layout</legend>
                <button type="button" aria-pressed={!stack} onClick={() => setStack(false)}>
                  Grid
                </button>
                <button type="button" aria-pressed={stack} onClick={() => setStack(true)}>
                  Stack
                </button>
              </fieldset>
            )}
          </div>
        )}
        {firstPage && !saved && (
          <MyDecks
            decks={decks}
            fillsScreen={nothingFollowsDecks || showCollections}
            deletedDeckTitle={deletedDeckTitle}
            focusDeletedDeckNotice={focusDeletedDeckNotice}
          />
        )}
        {removed && (
          <output
            ref={notice}
            tabIndex={-1}
            className="mb-6 block rounded-control bg-accent-soft p-compact-gutter text-support text-accent-strong wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Removed “{removed.title}” from your Library. Your progress is kept.
          </output>
        )}
        {library.isPending && (
          <WhenSlow>
            <output className="block">Loading saved sets…</output>
          </WhenSlow>
        )}
        {library.isError && (
          <div>
            <p role="alert" className="mb-4 text-muted">
              Your saved sets couldn’t load. Check your connection and try again.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => void library.refetch()}
                disabled={library.isFetching}
              >
                {library.isFetching ? 'Retrying…' : 'Retry saved sets'}
              </button>
              {after !== undefined && (
                <button type="button" className={secondaryButton} onClick={previousPage}>
                  Previous
                </button>
              )}
            </div>
          </div>
        )}
        {library.isSuccess && saved && (
          <>
            <SavedSets
              key={after ?? ''}
              sets={library.data.items}
              username={profile.username}
              paginated={Boolean(after || nextCursor)}
              onRemoved={(title, restoreFocus) => setRemoved({ title, restoreFocus })}
            />
            {(after !== undefined || nextCursor) && (
              <PageControls
                label="Library pages"
                onPrevious={after === undefined ? undefined : previousPage}
                onNext={nextCursor ? () => nextPage(nextCursor) : undefined}
              />
            )}
          </>
        )}
      </div>
    </WorkspacePage>
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
