import { Navigate, useLocation, useNavigate, useNavigationType, useOutletContext } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { LibraryFailure } from '../application/library';
import { useSavedSets } from './useSavedSets';
import type { LibraryBrowsing } from './LibraryBrowsingLayout';
import { CreateDeckLink, MyDecks } from './MyDecks';
import { useDecks } from './useDecks';
import { RemoveSetAction } from './RemoveSetAction';
import { LIBRARY_PATH, reviewTopicPath, setPath, signInPath } from '../../../shared/navigation/paths';
import { routeState } from '../../../shared/navigation/routeState';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { PageControls } from '../../../shared/ui/PageControls';
import { usePageCursor } from '../../../shared/navigation/usePageCursor';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';

export function LibraryPage() {
  const profile = useOutletContext<LibraryBrowsing>();
  const { cursor: after, previousPage, nextPage } = usePageCursor();
  const library = useSavedSets(profile.username, after);
  const firstPage = after === undefined;
  const deletion = useDeckDeletionNotice(profile, firstPage);
  const focusDeletedDeckNotice = deletion?.focus ?? false;
  const decks = useDecks(profile.username, firstPage);
  const [removed, setRemoved] = useState<{ title: string; restoreFocus: boolean } | null>(null);
  const notice = useRef<HTMLOutputElement>(null);
  const savedSetsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (removed?.restoreFocus && document.activeElement === document.body) notice.current?.focus();
  }, [removed]);
  if (library.error instanceof LibraryFailure && library.error.reason === 'signed-out') {
    return <Navigate replace to={signInPath(LIBRARY_PATH)} />;
  }
  const nextCursor = library.data?.nextCursor;
  const hasSavedSets = (library.data?.items.length ?? 0) > 0;
  const createInHeading = firstPage && decks.isSuccess && decks.data.length > 0;
  const loadingDeckSection = firstPage && !decks.isError && (decks.isPending || library.isPending);
  const nothingFollowsDecks = library.isSuccess && !hasSavedSets && !removed;
  return (
    <WorkspacePage
      title="Library"
      headingAction={
        createInHeading ? (
          <CreateDeckLink />
        ) : (
          firstPage && decks.isPending && <span aria-hidden="true" className="min-h-12" />
        )
      }
      focusHeading={!focusDeletedDeckNotice}
    >
      {firstPage && (
        <MyDecks
          decks={decks}
          loading={loadingDeckSection}
          showHeading={hasSavedSets}
          fillsScreen={nothingFollowsDecks}
          deletedDeckTitle={deletion?.title}
          focusDeletedDeckNotice={focusDeletedDeckNotice}
          headingAction={
            hasSavedSets &&
            createInHeading && (
              <a
                href="#saved-sets"
                className="pressable inline-flex min-h-12 items-center rounded-control px-2 text-support font-semibold text-accent"
                onClick={(event) => {
                  const heading = savedSetsHeading.current;
                  if (!heading) return;
                  event.preventDefault();
                  heading.focus({ preventScroll: true });
                  heading.scrollIntoView({ block: 'start' });
                }}
              >
                Jump to saved sets
              </a>
            )
          }
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
      {library.isPending && !loadingDeckSection && (
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
      {library.isSuccess && !loadingDeckSection && (hasSavedSets || !firstPage) && (
        <>
          <h2 id="saved-sets" ref={savedSetsHeading} tabIndex={-1} className="mb-4 scroll-mt-4 text-section font-bold">
            Saved sets
          </h2>
          {!hasSavedSets && <p className="text-body text-muted">No more saved sets.</p>}
          <ul className="grid gap-5 @min-[38rem]:grid-cols-2">
            {library.data.items.map((set) => (
              <li
                key={set.id}
                className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-compact-gutter shadow-card sm:p-5"
              >
                <h3 className="text-section font-bold tracking-tight wrap-anywhere">{set.title}</h3>
                <p className="mt-2 text-support text-muted wrap-anywhere">
                  By {set.publisherName} · {cardCountLabel(set.cardCount)}
                </p>
                <p className="mt-4 flex-1 text-body text-muted wrap-anywhere">{set.description}</p>
                {set.retired && (
                  <p className="mt-4 text-support font-semibold">No longer offered · Still in your Library</p>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                  {set.cardCount > 0 && (
                    <NavigationLink
                      to={reviewTopicPath(`set-${set.id}`, true)}
                      aria-label={`Start review: ${set.title}`}
                    >
                      Start review
                    </NavigationLink>
                  )}
                  {!set.retired && (
                    <NavigationLink to={setPath(set.setKey)} aria-label={`View set: ${set.title}`}>
                      View set
                    </NavigationLink>
                  )}
                  <RemoveSetAction
                    set={set}
                    username={profile.username}
                    onRemoved={(title, restoreFocus) => setRemoved({ title, restoreFocus })}
                  />
                </div>
              </li>
            ))}
          </ul>
          {(after !== undefined || nextCursor) && (
            <PageControls
              label="Library pages"
              onPrevious={after === undefined ? undefined : previousPage}
              onNext={nextCursor ? () => nextPage(nextCursor) : undefined}
            />
          )}
        </>
      )}
    </WorkspacePage>
  );
}

function useDeckDeletionNotice(profile: LibraryBrowsing, firstPage: boolean) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const arrivedFromDeletion = firstPage ? routeState(location).deletedDeckTitle : undefined;
  const [deletion, setDeletion] = useState(() => {
    if (!arrivedFromDeletion) return undefined;
    return {
      title: arrivedFromDeletion,
      focus: navigationType === 'REPLACE',
      search: profile.search,
      deckGroup: profile.deckGroup,
    };
  });
  if (deletion && (profile.search !== deletion.search || profile.deckGroup !== deletion.deckGroup))
    setDeletion(undefined);
  // Browsers keep history state across reloads and Back, so the deletion is confirmed only on arrival.
  useEffect(() => {
    if (routeState(location).deletedDeckTitle === undefined) return;
    void navigate(location, { replace: true, state: { ...routeState(location), deletedDeckTitle: undefined } });
  }, [location, navigate]);
  return deletion;
}
