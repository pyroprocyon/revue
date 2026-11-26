import { useContext, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import { DeckFailure, type Deck } from '../application/decks';
import type { useDecks } from './useDecks';
import { CollectionGrid } from './CollectionGrid';
import { CollectionSearch } from './CollectionSearch';
import { CollectionStatusMenu } from './CollectionStatusMenu';
import { DeckCarousel } from './DeckCarousel';
import { LIBRARY_PATH, NEW_DECK_PATH } from '../../../shared/navigation/paths';
import { SessionExpiredRedirect } from '../../../shared/navigation/SessionExpiredRedirect';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';
import type { DeckGroup, LibraryBrowsing } from './LibraryBrowsingLayout';
import { DECKS_UNAVAILABLE_TEXT, decksUnavailable } from './decksUnavailable';

export function CreateDeckLink() {
  return (
    <Link
      to={NEW_DECK_PATH}
      className="create-deck-pill pressable tonal-control-gradient inline-flex min-h-12 max-w-full items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-center text-body font-semibold text-accent-strong @max-[20rem]:min-h-[48px] @max-[20rem]:px-2 @max-[20rem]:text-label"
    >
      <Plus aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 wrap-anywhere">Create a deck</span>
    </Link>
  );
}

export function MyDecks({
  decks,
  fillsScreen,
  deletedDeckTitle,
  focusDeletedDeckNotice,
}: Readonly<{
  decks: ReturnType<typeof useDecks>;
  fillsScreen: boolean;
  deletedDeckTitle?: string;
  focusDeletedDeckNotice: boolean;
}>) {
  if (decks.error instanceof DeckFailure && decks.error.reason === 'signed-out') {
    return <SessionExpiredRedirect returnTo={LIBRARY_PATH} />;
  }
  const unavailable = decksUnavailable(decks.error);
  const loadMessage = unavailable
    ? DECKS_UNAVAILABLE_TEXT
    : 'Your decks couldn’t load. Check your connection and try again.';
  return (
    <section aria-labelledby="my-decks-heading" className={fillsScreen ? undefined : 'mb-10'}>
      <h2 id="my-decks-heading" className="sr-only">
        My decks
      </h2>
      {deletedDeckTitle && <DeletedDeckNotice title={deletedDeckTitle} focusOnEntry={focusDeletedDeckNotice} />}
      {decks.data &&
        (decks.data.length === 0 ? (
          <div className="library-empty-state flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-compact-gutter sm:p-6">
            <p className="text-body text-muted">Make private flashcards for a class or exam.</p>
            <CreateDeckLink />
          </div>
        ) : (
          <DeckList decks={decks.data} fillsScreen={fillsScreen} restoreDeckFocus={!focusDeletedDeckNotice} />
        ))}
      {decks.isError && (
        <div className={decks.data ? 'mt-4' : undefined}>
          <p role="alert" className="mb-4 text-muted">
            {decks.data ? 'Your decks couldn’t refresh. Check your connection and try again.' : loadMessage}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryButton}
              onClick={() => void decks.refetch()}
              disabled={decks.isFetching}
            >
              {decks.isFetching ? 'Retrying…' : 'Retry decks'}
            </button>
            {!decks.data && !unavailable && <CreateDeckLink />}
          </div>
        </div>
      )}
      {decks.isPending && (
        <WhenSlow>
          <LoadingStatus>Loading your decks…</LoadingStatus>
        </WhenSlow>
      )}
    </section>
  );
}

function DeletedDeckNotice({ title, focusOnEntry }: Readonly<{ title: string; focusOnEntry: boolean }>) {
  const focus = useFocusOnMount<HTMLOutputElement>(focusOnEntry);
  return (
    <output
      {...focus}
      className="mb-4 block rounded-control bg-accent-soft p-compact-gutter text-support text-accent-strong wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Deleted “{title}” and its cards.
    </output>
  );
}

const groupOf = (deck: Deck): DeckGroup => (deck.archived ? 'paused' : 'active');

function DeckList({
  decks,
  fillsScreen,
  restoreDeckFocus,
}: Readonly<{ decks: readonly Deck[]; fillsScreen: boolean; restoreDeckFocus: boolean }>) {
  const { search, deckGroup, openedDeckId, searchDecks, showDeckGroup, rememberOpenedDeck } =
    useOutletContext<LibraryBrowsing>();
  const [returnDeckId] = useState(restoreDeckFocus ? openedDeckId : null);
  const [returnGroup, setReturnGroup] = useState(() => {
    const returned = decks.find((deck) => deck.id === returnDeckId);
    return returned ? groupOf(returned) : null;
  });
  const list = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const requestFocus = useContext(FocusRequestContext);
  const pausedCount = decks.filter((deck) => deck.archived).length;
  const group = pausedCount > 0 ? (returnGroup ?? deckGroup) : 'active';
  const term = search.trim().toLowerCase();
  const found = term ? decks.filter((deck) => deck.title.toLowerCase().includes(term)) : decks;
  const matches = found.filter((deck) => groupOf(deck) === group);
  const otherGroupMatches = found.length - matches.length;
  const initialIndex = Math.max(
    0,
    matches.findIndex((deck) => deck.id === openedDeckId),
  );

  useEffect(() => {
    if (returnGroup !== null && returnGroup !== deckGroup) showDeckGroup(returnGroup);
  }, [returnGroup, deckGroup, showDeckGroup]);

  useEffect(() => {
    if (returnDeckId === null) return;
    const frame = requestAnimationFrame(() => {
      const links = list.current?.querySelectorAll<HTMLAnchorElement>('a[data-library-deck]') ?? [];
      const returnedLink = Array.from(links).find(
        (link) => link.dataset.libraryDeck === returnDeckId && link.getClientRects().length > 0,
      );
      requestFocus(returnedLink ?? searchInput.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [requestFocus, returnDeckId]);

  function chooseGroup(next: DeckGroup) {
    setReturnGroup(null);
    showDeckGroup(next);
  }

  function openDeck(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const id = event.currentTarget.dataset.libraryDeck;
    if (id) rememberOpenedDeck(id);
  }

  const searchBox = (decks.length > 1 || search) && (
    <CollectionSearch
      label="Search decks"
      placeholder="Search decks"
      clearLabel="Clear deck search"
      value={search}
      onChange={searchDecks}
      inputRef={searchInput}
    />
  );
  return (
    <div ref={list}>
      {pausedCount > 0 ? (
        <CollectionStatusMenu
          group={group}
          counts={{ active: decks.length - pausedCount, paused: pausedCount }}
          onChoose={chooseGroup}
        >
          {searchBox}
        </CollectionStatusMenu>
      ) : (
        searchBox
      )}
      {term && (
        <output className={matches.length ? 'sr-only' : 'block py-2 text-body text-muted'}>
          {searchResult(matches.length, decks.length, group, otherGroupMatches)}
        </output>
      )}
      {matches.length === 0 && term && otherGroupMatches > 0 && (
        <button
          type="button"
          className={`${secondaryButton} mt-2`}
          onClick={() => chooseGroup(group === 'paused' ? 'active' : 'paused')}
        >
          Show {group === 'paused' ? 'active' : 'paused'} decks
        </button>
      )}
      {matches.length === 0 && !term && (
        <p className="py-2 text-body text-muted">No active decks. Resume one from Paused, or create a deck.</p>
      )}
      {matches.length > 0 && (
        <>
          <DeckCarousel
            key={group + term}
            decks={matches}
            fillsScreen={fillsScreen}
            initialIndex={initialIndex}
            onOpen={openDeck}
          />
          <CollectionGrid decks={matches} onOpen={openDeck} />
        </>
      )}
    </div>
  );
}

function searchResult(found: number, total: number, group: DeckGroup, inOtherGroup: number) {
  if (found > 0) return `Found ${found} of ${total} decks.`;
  if (inOtherGroup === 0) return 'No decks match your search.';
  const other = group === 'paused' ? 'active' : 'paused';
  return `No ${group} decks match. ${inOtherGroup} ${other} ${inOtherGroup === 1 ? 'deck matches' : 'decks match'}.`;
}
