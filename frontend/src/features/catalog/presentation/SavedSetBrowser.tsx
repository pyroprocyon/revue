import { BookOpen, ChevronRight, Info, X } from 'lucide-react';
import { useCallback, useContext, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { DeckCard, DeckCardQuery } from '../application/decks';
import { LibraryFailure, type SavedSet } from '../application/library';
import { CardPreview } from './CardPreview';
import { CardScreen } from './CardScreen';
import { DeckCardList, DeckCardsHeader } from './DeckCardList';
import { cardToolButton, DeckStatus, DeckToolbar } from './DeckToolbar';
import { DueFilter } from './DueFilter';
import { RemoveSetAction, useRemoveSetAction } from './RemoveSetAction';
import { ReviewSettings } from './ReviewSettings';
import { setReviewPauseProblem, useSetReviewPause } from './useSetReviewPause';
import { MoreCards } from './MoreCards';
import { belowToolbar, cardPaneGutters, onePane, paneBelowStickyToolbar, twoPanes } from './cardBrowserLayout';
import type { useSavedSetCards, CardPages } from './useDecks';
import { savedReviewerCardQuery } from './useSavedSets';
import { useTwoPanes } from './useTwoPanes';
import { libraryKeys } from '../../../shared/cache/queryKeys';
import { LIBRARY_PATH, setPath } from '../../../shared/navigation/paths';
import { SessionExpiredRedirect } from '../../../shared/navigation/SessionExpiredRedirect';
import { OPENED_FROM_LIBRARY, routeState } from '../../../shared/navigation/routeState';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';
import { PageControls } from '../../../shared/ui/PageControls';
import { LoadingPlaceholder, LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { secondaryButton } from '../../../shared/ui/buttonStyles';

type Props = {
  set: SavedSet;
  cards: ReturnType<typeof useSavedSetCards>;
  showLoading: boolean;
  username: string;
  backTo: string;
  onRemoved: (title: string, restoreFocus: boolean) => void;
};

export function SavedSetBrowser({ set, cards, showLoading, username, backTo, onRemoved }: Readonly<Props>) {
  const location = useLocation();
  const { search, dueOnly, after, view, onSearch, onDue, pageTo, cursors } = useSavedCardFilters();
  const { items, dueIds, deck, progress, unavailable, signedOut, nextCursor } = useSavedCardPage(
    set,
    username,
    { search, dueOnly, after },
    cards,
  );
  const [panes, wide] = useTwoPanes();
  const [toolbarBottom, setToolbarBottom] = useState<number | null>(null);
  const settings = useSetSettings();
  const { selected, phoneCard, openCard, closeCard, results } = useCardSelection(wide, items, settings.control.open);
  const question = useRef<HTMLHeadingElement>(null);
  const questionId = useId();
  const aboutId = useId();
  const [aboutOpen, setAboutOpen] = useState(false);
  const removal = useRemoveSetAction({ set, username, onRemoved });
  const pause = useSetReviewPause(username, set);
  const paneClass = toolbarBottom === null ? 'min-w-0' : paneBelowStickyToolbar;
  const previewTabIndex = toolbarBottom === null ? undefined : 0;

  if (signedOut || (pause.error instanceof LibraryFailure && pause.error.reason === 'signed-out')) {
    return <SessionExpiredRedirect returnTo={LIBRARY_PATH + location.search} />;
  }
  const earlier = after === undefined ? undefined : () => pageTo(cursors.at(-1), cursors.slice(0, -1));
  const pagination = (earlier || nextCursor) && (
    <PageControls
      label="Card pages"
      compact
      className=""
      onPrevious={earlier}
      onNext={nextCursor ? () => pageTo(nextCursor, [...cursors, after]) : undefined}
    />
  );
  const emptyMessage = savedCardEmptyMessage(cards.isSuccess && items.length === 0, search, dueOnly, Boolean(after));
  const filter = (dueOnly || (progress?.dueCards ?? 0) > 0) && <DueFilter dueOnly={dueOnly} onChange={onDue} />;
  return (
    <WorkspacePage
      title={set.title}
      headingId="saved-set-title"
      aboveTitle={<SavedSetBack to={backTo} />}
      subtitle={<DeckStatus deck={deck} progress={progress ?? { dueCards: 0, newCards: 0, nextReviewDate: null }} />}
    >
      <DeckToolbar
        wide={wide}
        deck={deck}
        progress={progress}
        term={search}
        onSearch={onSearch}
        onClearSearch={() => onSearch('')}
        savedSetBack={backTo}
        stickyBottom={toolbarBottom}
        onHeldBottomChange={setToolbarBottom}
        settings={settings.control}
        settingsButton={settings.button}
        filter={!wide && filter}
        onResume={() => pause.mutate(false)}
        resuming={pause.isPending || removal.state === 'removing'}
        collectionAction={
          <button
            type="button"
            title="About this reviewer"
            aria-label="About this reviewer"
            aria-expanded={aboutOpen}
            aria-controls={aboutId}
            className={cardToolButton}
            onClick={() => setAboutOpen(!aboutOpen)}
          >
            <Info aria-hidden="true" className="size-5" />
          </button>
        }
      />
      {!settings.control.open && pause.error && (
        <p role="alert" className="my-3 text-support text-muted">
          {setReviewPauseProblem(pause.error)}
        </p>
      )}
      <div
        id={aboutId}
        hidden={!aboutOpen}
        className="my-3 rounded-card border border-line bg-surface p-4 text-support"
      >
        <p className="font-semibold text-saved-set">By {set.publisherName}</p>
        <p className="mt-1 text-muted wrap-anywhere">{set.description}</p>
      </div>
      {set.retired && <p className="my-2 text-support font-semibold">No longer offered · Still in your Library</p>}
      <SavedCardsFeedback
        cards={cards}
        showLoading={showLoading}
        unavailable={unavailable}
        search={search}
        filtered={dueOnly || Boolean(after)}
      />
      <div ref={panes} className={wide ? twoPanes : onePane} style={belowToolbar(toolbarBottom)}>
        <DeckCardsHeader filter={wide && filter} pagination={wide && pagination} />
        <DeckCardList
          cards={items}
          dueIds={dueIds}
          emptyMessage={emptyMessage}
          wide={wide}
          selectedId={selected?.id ?? null}
          onOpen={(card) => {
            settings.hide();
            openCard(card);
          }}
          resultsRef={results}
        />
        {!wide && !unavailable && <MoreCards key={view} cards={cards} onEarlier={earlier} />}
        {wide && selected && (
          <section
            aria-label="Selected card"
            tabIndex={previewTabIndex /* NOSONAR S6845: WebKit skips unfocusable scroll panes. */}
            className={`${paneClass} ${cardPaneGutters} rounded-card border border-saved-set/25 bg-surface py-5 shadow-control focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-saved-set`}
          >
            <CardPreview card={selected} questionId={questionId} savedSet />
          </section>
        )}
        {wide && settings.control.open && (
          <section
            id={settings.control.id}
            aria-label="Reviewer settings"
            className={`${paneClass} ${cardPaneGutters} rounded-card bg-surface py-5 shadow-card`}
          >
            <SetSettingsContents
              set={set}
              removal={removal}
              paused={deck.archived}
              pause={pause}
              onClose={settings.close}
            />
          </section>
        )}
      </div>
      {!wide && phoneCard && (
        <CardScreen
          label={phoneCard.question}
          backLabel="Cards"
          onBack={closeCard}
          view={phoneCard.id}
          focusTarget={question}
        >
          <div className="rounded-card border border-saved-set/25 bg-surface p-5 shadow-control">
            <CardPreview card={phoneCard} questionId={questionId} questionRef={question} savedSet />
          </div>
        </CardScreen>
      )}
      {!wide && settings.control.open && (
        <CardScreen label="Reviewer settings" backLabel="Cards" view="settings" onBack={settings.close}>
          <div id={settings.control.id} className="rounded-card bg-surface p-5 shadow-card">
            <SetSettingsContents set={set} removal={removal} paused={deck.archived} pause={pause} />
          </div>
        </CardScreen>
      )}
    </WorkspacePage>
  );
}

function SavedSetBack({ to }: Readonly<{ to: string }>) {
  const navigate = useNavigate();
  const state = routeState(useLocation());
  return (
    <NavigationLink
      to={to}
      back
      state={{ previousCursors: state.previousCursors }}
      aria-label="Back to Library"
      className="workspace-page-back -mt-2 -ml-2 mb-1"
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          state.fromSavedSetList
        ) {
          event.preventDefault();
          void navigate(-1);
        }
      }}
    >
      Library
    </NavigationLink>
  );
}

function useSetSettings() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const requestFocus = useContext(FocusRequestContext);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => {
      if (button.current) requestFocus(button.current);
    });
  }
  function toggle() {
    if (open) close();
    else setOpen(true);
  }
  return {
    control: { id, open, label: 'Reviewer settings', onToggle: toggle },
    button,
    close,
    hide: () => setOpen(false),
  };
}

function SetSettingsContents({
  set,
  removal,
  paused,
  pause,
  onClose,
}: Readonly<{
  set: SavedSet;
  removal: ReturnType<typeof useRemoveSetAction>;
  paused: boolean;
  pause: ReturnType<typeof useSetReviewPause>;
  onClose?: () => void;
}>) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const previewDescription = useId();
  const confirmingRemoval = removal.state === 'confirming';
  return (
    <>
      <div className="flex items-start gap-3">
        <h2 {...heading} className="min-w-0 flex-1 text-section font-bold outline-none">
          Reviewer settings
        </h2>
        {onClose && (
          <button
            type="button"
            className="pressable -mt-1 -mr-2 grid size-12 shrink-0 place-items-center rounded-control text-muted"
            aria-label="Close reviewer settings"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      <div className="@container/settings mt-6">
        {!set.retired && (
          <Link
            className="pressable grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-[min(0.625rem,10px)] rounded-control border border-saved-set/20 bg-saved-set-soft/60 px-[min(0.75rem,12px)] py-3 text-saved-set @min-[14rem]/settings:grid-cols-[auto_minmax(0,1fr)_auto]"
            to={setPath(set.setKey)}
            state={OPENED_FROM_LIBRARY}
            aria-label={`Public preview: ${set.title}`}
            aria-describedby={previewDescription}
          >
            <span className="hidden size-[min(2.25rem,36px)] place-items-center rounded-inset bg-saved-set-soft @min-[14rem]/settings:grid">
              <BookOpen aria-hidden="true" className="size-[min(1.125rem,20px)]" />
            </span>
            <span className="min-w-0 wrap-anywhere">
              <span className="block text-label font-bold">Public preview</span>
              <span id={previewDescription} className="mt-0.5 block text-support text-muted">
                Open the shareable page for this reviewer.
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-[min(1rem,20px)]" />
          </Link>
        )}
        <ReviewSettings
          collection="reviewer"
          paused={paused}
          busy={pause.isPending || removal.state === 'removing'}
          onToggle={() => pause.mutate(!paused)}
        >
          {pause.error && (
            <p role="alert" className="mt-2 text-support text-muted">
              {setReviewPauseProblem(pause.error)}
            </p>
          )}
        </ReviewSettings>
        <fieldset disabled={pause.isPending} className="mt-7 min-w-0 border-t border-line pt-5">
          {!confirmingRemoval && (
            <>
              <h3 className="text-label font-bold">Remove from Library</h3>
              <p className="mt-1 text-support text-muted">Your review progress stays saved.</p>
            </>
          )}
          <div className={confirmingRemoval ? undefined : 'mt-3'}>
            <RemoveSetAction set={set} action={removal} />
          </div>
        </fieldset>
      </div>
    </>
  );
}

function useSavedCardFilters() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { search, dueOnly, after } = savedReviewerCardQuery(params);
  const cursors = routeState(location).savedCardCursors ?? [];
  const changeFilter = useCallback(
    (key: 'cardQuery' | 'cardDue', value: string) => {
      const updated = new URLSearchParams(params);
      if (value) updated.set(key, value);
      else updated.delete(key);
      updated.delete('cardAfter');
      setParams(updated, { replace: true, state: { ...routeState(location), savedCardCursors: [] } });
    },
    [params, setParams, location],
  );
  const onSearch = useCallback((value: string) => changeFilter('cardQuery', value), [changeFilter]);

  function pageTo(cursor: string | undefined, earlier: (string | undefined)[]) {
    const updated = new URLSearchParams(params);
    if (cursor) updated.set('cardAfter', cursor);
    else updated.delete('cardAfter');
    setParams(updated, { replace: true, state: { ...routeState(location), savedCardCursors: earlier } });
  }

  return {
    search,
    dueOnly,
    after,
    view: params.toString(),
    onSearch,
    onDue: (value: boolean) => changeFilter('cardDue', value ? '1' : ''),
    pageTo,
    cursors,
  };
}

function useSavedCardPage(
  set: SavedSet,
  username: string,
  query: DeckCardQuery,
  cards: ReturnType<typeof useSavedSetCards>,
) {
  const client = useQueryClient();
  const failure = cards.error instanceof LibraryFailure ? cards.error.reason : undefined;
  const unavailable = failure === 'unavailable';
  const pages = unavailable ? undefined : cards.data?.pages;
  const page =
    pages?.[0] ??
    client
      .getQueriesData<CardPages>({ queryKey: libraryKeys.cardPages(username, set.id) })
      .find(([, cached]) => cached)?.[1]?.pages[0];
  const deck = page?.deck ?? {
    id: set.id,
    title: set.title,
    cardCount: set.cardCount,
    archived: set.reviewsPaused ?? false,
  };
  return {
    cards,
    unavailable,
    signedOut: failure === 'signed-out',
    items: deck.archived && query.dueOnly ? [] : (pages?.flatMap((batch) => batch.items) ?? []),
    dueIds: new Set(deck.archived ? [] : pages?.flatMap((batch) => batch.dueCardIds)),
    deck,
    progress: unavailable ? undefined : page?.progress,
    nextCursor: pages?.at(-1)?.nextCursor,
  };
}

function useCardSelection(wide: boolean, items: DeckCard[], settingsOpen: boolean) {
  const requestFocus = useContext(FocusRequestContext);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phoneCardId, setPhoneCardId] = useState<string | null>(null);
  const results = useRef<HTMLElement>(null);
  const selected = settingsOpen ? undefined : (items.find((card) => card.id === selectedId) ?? items[0]);
  const phoneCard = items.find((card) => card.id === phoneCardId);
  if (wide && phoneCardId !== null) setPhoneCardId(null);

  function openCard(card: DeckCard) {
    setSelectedId(card.id);
    if (!wide) setPhoneCardId(card.id);
  }

  function closeCard() {
    const id = phoneCardId;
    setPhoneCardId(null);
    requestAnimationFrame(() => {
      const row = id && results.current?.querySelector<HTMLElement>(`[data-card-row="${id}"]`);
      if (results.current) requestFocus(row || results.current);
    });
  }

  return { selected, phoneCard, openCard, closeCard, results };
}

function savedCardEmptyMessage(empty: boolean, search: string, dueOnly: boolean, paged: boolean) {
  if (!empty) return null;
  if (paged) return 'There are no cards on this page.';
  if (dueOnly) return search ? 'No due cards match your search.' : 'No cards are due.';
  return search ? 'No cards match your search.' : 'There are no cards here.';
}

function SavedCardsFeedback({
  cards,
  showLoading,
  unavailable,
  search,
  filtered,
}: Readonly<{
  cards: ReturnType<typeof useSavedSetCards>;
  showLoading: boolean;
  unavailable: boolean;
  search: string;
  filtered: boolean;
}>) {
  if (cards.isPending) {
    if (!showLoading) return null;
    return search || filtered ? (
      <LoadingStatus>{search ? 'Searching cards…' : 'Loading cards…'}</LoadingStatus>
    ) : (
      <LoadingPlaceholder kind="rows" blue>
        Loading cards…
      </LoadingPlaceholder>
    );
  }
  if (!unavailable && (!cards.isError || cards.isFetchNextPageError)) return null;
  return (
    <div className="mb-4">
      <p className="mb-2 text-support text-muted" role="alert">
        {unavailable
          ? 'This reviewer isn’t in your Library.'
          : 'Couldn’t load these cards. Check your connection and try again.'}
      </p>
      {!unavailable && (
        <button
          type="button"
          className={secondaryButton}
          onClick={() => void cards.refetch()}
          disabled={cards.isFetching}
        >
          Try again
        </button>
      )}
    </div>
  );
}
