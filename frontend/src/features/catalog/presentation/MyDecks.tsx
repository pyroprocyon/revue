import { Search, X } from 'lucide-react';
import { useContext, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router';
import { DeckFailure, type Deck } from '../application/decks';
import type { useDecks } from './useDecks';
import { CollectionGrid } from './CollectionGrid';
import { DeckCarousel } from './DeckCarousel';
import { LIBRARY_PATH, NEW_DECK_PATH, signInPath } from '../../../shared/navigation/paths';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';
import type { DeckGroup, LibraryBrowsing } from './LibraryBrowsingLayout';
import { DECKS_UNAVAILABLE_TEXT, decksUnavailable } from './decksUnavailable';

export function CreateDeckLink() {
  return (
    <Link to={NEW_DECK_PATH} className={`${primaryButton} @max-[20rem]:min-h-[48px] @max-[20rem]:px-2`}>
      Create a deck
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
    return <Navigate replace to={signInPath(LIBRARY_PATH)} />;
  }
  return (
    <section aria-labelledby="my-decks-heading" className={fillsScreen ? undefined : 'mb-10'}>
      <h2 id="my-decks-heading" className="sr-only">
        My decks
      </h2>
      {deletedDeckTitle && <DeletedDeckNotice title={deletedDeckTitle} focusOnEntry={focusDeletedDeckNotice} />}
      {decks.isError && (
        <div>
          <p role="alert" className="mb-4 text-muted">
            {decksUnavailable(decks.error)
              ? DECKS_UNAVAILABLE_TEXT
              : 'Your decks couldn’t load. Check your connection and try again.'}
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
            {!decksUnavailable(decks.error) && (
              <Link to={NEW_DECK_PATH} className={secondaryButton}>
                Create a deck
              </Link>
            )}
          </div>
        </div>
      )}
      {decks.isPending && (
        <WhenSlow>
          <output className="block text-muted">Loading your decks…</output>
        </WhenSlow>
      )}
      {decks.isSuccess &&
        (decks.data.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-compact-gutter sm:p-6">
            <p className="text-body text-muted">Make private flashcards for a class or exam.</p>
            <CreateDeckLink />
          </div>
        ) : (
          <DeckList decks={decks.data} fillsScreen={fillsScreen} restoreDeckFocus={!focusDeletedDeckNotice} />
        ))}
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

  return (
    <>
      {pausedCount > 0 && (
        <DeckGroupChoice
          group={group}
          counts={{ active: decks.length - pausedCount, paused: pausedCount }}
          onChoose={chooseGroup}
        />
      )}
      <div ref={list} className="relative">
        {(decks.length > 1 || search) && (
          <div
            className={`relative mb-3 w-full @min-[38rem]:mb-5 @min-[38rem]:max-w-sm ${matches.length > 1 ? 'deck-search-with-position' : ''}`}
          >
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-[14px] size-[16px] -translate-y-1/2 text-muted"
            />
            <input
              ref={searchInput}
              type="search"
              aria-label="Search decks"
              placeholder="Search decks"
              value={search}
              onChange={(event) => searchDecks(event.target.value)}
              className={`min-h-[48px] w-full rounded-control border border-field-edge bg-surface py-2 pl-[40px] text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden ${search ? 'pr-[56px]' : 'pr-3'}`}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear deck search"
                className="pressable absolute top-0 right-0 grid h-full min-w-[48px] place-items-center rounded-control text-muted"
                onClick={() => {
                  searchDecks('');
                  searchInput.current?.focus();
                }}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
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
    </>
  );
}

function searchResult(found: number, total: number, group: DeckGroup, inOtherGroup: number) {
  if (found > 0) return `Found ${found} of ${total} decks.`;
  if (inOtherGroup === 0) return 'No decks match your search.';
  const other = group === 'paused' ? 'active' : 'paused';
  return `No ${group} decks match. ${inOtherGroup} ${other} ${inOtherGroup === 1 ? 'deck matches' : 'decks match'}.`;
}

function DeckGroupChoice({
  group,
  counts,
  onChoose,
}: Readonly<{ group: DeckGroup; counts: Record<DeckGroup, number>; onChoose: (group: DeckGroup) => void }>) {
  const labels: Record<DeckGroup, string> = { active: 'Active', paused: 'Paused' };
  return (
    <fieldset className="mb-3 flex w-full min-w-0 flex-wrap gap-1 rounded-control bg-subtle p-1 @min-[38rem]:mb-4 @min-[38rem]:max-w-sm">
      <legend className="sr-only">Show decks</legend>
      {(['active', 'paused'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={group === option}
          onClick={() => onChoose(option)}
          className="pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-inset px-2 text-label font-bold text-muted aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-control"
        >
          {labels[option]} <span className="font-semibold text-muted tabular-nums">{counts[option]}</span>
        </button>
      ))}
    </fieldset>
  );
}
