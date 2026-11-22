import { ChevronRight, Search, X } from 'lucide-react';
import { useContext, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router';
import { DeckFailure, type Deck } from '../application/decks';
import type { useDecks } from './useDecks';
import { DeckCarousel } from './DeckCarousel';
import { LIBRARY_PATH, NEW_DECK_PATH, deckPath, signInPath } from '../../../shared/navigation/paths';
import { cardCountLabel } from '../../../shared/ui/cardCount';
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
  loading,
  showHeading,
  fillsScreen,
  deletedDeckTitle,
  focusDeletedDeckNotice,
  headingAction,
}: Readonly<{
  decks: ReturnType<typeof useDecks>;
  loading: boolean;
  showHeading: boolean;
  fillsScreen: boolean;
  deletedDeckTitle?: string;
  focusDeletedDeckNotice: boolean;
  headingAction?: ReactNode;
}>) {
  if (decks.error instanceof DeckFailure && decks.error.reason === 'signed-out') {
    return <Navigate replace to={signInPath(LIBRARY_PATH)} />;
  }
  return (
    <section aria-labelledby="my-decks-heading" className={fillsScreen ? undefined : 'mb-10'}>
      <div className={showHeading ? 'mb-4 flex min-h-12 flex-wrap items-center justify-between gap-3' : 'sr-only'}>
        <h2 id="my-decks-heading" className="text-section font-bold">
          My decks
        </h2>
        {headingAction}
      </div>
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
      {loading && (
        <div
          aria-busy="true"
          className="min-h-40 rounded-card @min-[38rem]:min-h-34 @min-[64rem]/workspace:min-h-24 bg-surface p-compact-gutter shadow-card"
        >
          <WhenSlow>
            <output className="block text-muted">Loading your Library…</output>
          </WhenSlow>
        </div>
      )}
      {!loading &&
        decks.isSuccess &&
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
            <DeckGrid decks={matches} onOpen={openDeck} />
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

function DeckGrid({
  decks,
  onOpen,
}: Readonly<{ decks: readonly Deck[]; onOpen: (event: MouseEvent<HTMLAnchorElement>) => void }>) {
  const grid = useRef<HTMLUListElement>(null);
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    // The workspace container query decides when the grid has a box. Mount its links
    // before focus is restored on desktop and skip building hidden tiles on phones.
    setVisible(element.getClientRects().length > 0);
    const sizeChanges = new ResizeObserver(([entry]) => setVisible(entry.contentRect.width > 0));
    sizeChanges.observe(element);
    return () => sizeChanges.disconnect();
  }, []);
  return (
    <ul ref={grid} className="hidden auto-rows-fr grid-cols-2 gap-4 @min-[64rem]/workspace:grid">
      {visible && decks.map((deck) => <DeckTile key={deck.id} deck={deck} onOpen={onOpen} />)}
    </ul>
  );
}

function DeckTile({ deck, onOpen }: Readonly<{ deck: Deck; onOpen: (event: MouseEvent<HTMLAnchorElement>) => void }>) {
  const countId = `grid-deck-${deck.id}-card-count`;
  return (
    <li className="min-w-0">
      <Link
        to={deckPath(deck.id)}
        aria-label={`Open ${deck.title}`}
        aria-describedby={countId}
        data-library-deck={deck.id}
        onClick={onOpen}
        className={`pressable flex h-full min-h-24 min-w-0 flex-col justify-between gap-3 rounded-control px-5 py-4 ${deck.archived ? 'bg-subtle text-muted' : 'shadow-control hover:shadow-card'}`}
      >
        <h3 className="text-section leading-snug font-bold tracking-tight text-balance wrap-anywhere">{deck.title}</h3>
        <div className="flex items-center justify-between gap-2">
          <p
            id={countId}
            className={`rounded-full px-2.5 py-0.5 text-support font-medium tabular-nums ${deck.archived ? 'bg-surface text-muted' : 'bg-accent-soft text-accent-strong'}`}
          >
            {cardCountLabel(deck.cardCount)}
            {deck.archived && <span className="sr-only">, paused</span>}
          </p>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-accent" />
        </div>
      </Link>
    </li>
  );
}
