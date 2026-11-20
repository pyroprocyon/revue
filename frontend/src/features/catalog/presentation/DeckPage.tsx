import { ChevronRight, ClipboardPaste, Pencil, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeckDraftGuard, useHasUnsavedDeckChanges } from './UnsavedDeckChanges';
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { Link, Navigate, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router';
import type { AccountProfile } from '../../account/application/account';
import { DeckFailure, type CardDraft, type Deck, type DeckCard, type DeckProgress } from '../application/decks';
import { CardForm, draftOf } from './CardForm';
import { CardPreview } from './CardPreview';
import { CardScreen, type CardControls } from './CardScreen';
import { CreateDeckSteps } from './CreateDeckSteps';
import { ConfirmDelete } from './ConfirmDelete';
import { DeckCardList } from './DeckCardList';
import { MoreCards } from './MoreCards';
import { useDeckGateway } from './DeckProvider';
import { DeckSettings } from './DeckSettings';
import { DeckStatus, DeckToolbar, DueFilter } from './DeckToolbar';
import { DeckWriteProblem } from './DeckWriteProblem';
import {
  matchesCardSearch,
  updateCachedCards,
  updateDeckPages,
  useDeckCards,
  useDeckWrite,
  type CardPages,
} from './useDecks';
import { useTwoPanes } from './useTwoPanes';
import { deckKeys } from '../../../shared/cache/queryKeys';
import { LIBRARY_PATH, pasteCardsPath, signInPath } from '../../../shared/navigation/paths';
import { routeState } from '../../../shared/navigation/routeState';
import { usePageCursor } from '../../../shared/navigation/usePageCursor';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { PageControls } from '../../../shared/ui/PageControls';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { DECKS_UNAVAILABLE_TEXT, decksUnavailable } from './decksUnavailable';

export function DeckPage() {
  const profile = useOutletContext<AccountProfile>();
  const location = useLocation();
  const { deckId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { cursor: after, previousPage, nextPage } = usePageCursor();
  const term = params.get('q')?.trim() ?? '';
  const dueOnly = params.get('due') === '1';
  const cards = useDeckCards(profile.username, deckId, { after, search: term, dueOnly });
  const client = useQueryClient();
  const navigate = useNavigate();
  const [importNotice] = useState(() => importedCardsNotice(routeState(location).importedCards));
  // Browsers keep history state across reloads and Back, so the import is confirmed only on arrival.
  useEffect(() => {
    if (routeState(location).importedCards === undefined) return;
    void navigate(location, { replace: true, state: { ...routeState(location), importedCards: undefined } });
  }, [location, navigate]);
  const hasDrafts = useHasUnsavedDeckChanges();
  const search = useCallback(
    (value: string, replace = false) => {
      if (value !== term) setParams(firstPageWith(params, 'q', value), { replace });
    },
    [params, setParams, term],
  );
  const showDue = (value: boolean) => setParams(firstPageWith(params, 'due', value ? '1' : ''));
  if (cards.error instanceof DeckFailure && cards.error.reason === 'signed-out') {
    return <Navigate replace to={signInPath(LIBRARY_PATH)} />;
  }
  const deckIsGone = cards.error instanceof DeckFailure && cards.error.reason === 'not-found';
  const page =
    cards.data?.pages[0] ??
    client
      .getQueriesData<CardPages>({ queryKey: deckKeys.cardPages(profile.username, deckId) })
      .find(([, cached]) => cached)?.[1]?.pages[0];
  const deck = page?.deck;
  const onEarlier = after === undefined ? undefined : previousPage;
  const feedback = <DeckLoadFeedback cards={cards} term={term} deckIsGone={deckIsGone} />;

  if (page && deck && (!deckIsGone || hasDrafts)) {
    return (
      <DeckContent
        key={`${profile.username}:${deckId}`}
        username={profile.username}
        justCreated={routeState(location).createdDeck === true}
        arrivalNotice={importNotice}
        deck={deck}
        progress={page.progress}
        {...loadedCards(deck, cards.data?.pages)}
        refreshing={cards.isFetching}
        dueOnly={dueOnly}
        onDueOnly={showDue}
        unavailable={deckIsGone}
        view={params.toString()}
        term={term}
        onSearch={search}
        feedback={feedback}
        moreCards={<MoreCards key={params.toString()} cards={cards} onEarlier={onEarlier} />}
        pagination={deckPagination(onEarlier, cards.data?.pages.at(-1)?.nextCursor, nextPage)}
      />
    );
  }
  return (
    <WorkspacePage title={deckIsGone ? 'Deck' : (deck?.title ?? 'Deck')}>
      {feedback}
      <NavigationLink to={LIBRARY_PATH} back>
        Back to Library
      </NavigationLink>
    </WorkspacePage>
  );
}

function importedCardsNotice(importedCards: number | undefined) {
  return importedCards === undefined ? null : `${cardCountLabel(importedCards)} imported.`;
}

function loadedCards(deck: Deck, pages: CardPages['pages'] | undefined) {
  return {
    items: pages?.flatMap((batch) => batch.items),
    dueCardIds: deck.archived ? [] : (pages?.flatMap((batch) => batch.dueCardIds) ?? []),
  };
}

function deckPagination(
  onPrevious: (() => void) | undefined,
  nextCursor: string | null | undefined,
  nextPage: (cursor: string) => void,
) {
  if (!onPrevious && !nextCursor) return null;
  return (
    <PageControls
      label="Deck pages"
      compact
      className=""
      onPrevious={onPrevious}
      onNext={nextCursor ? () => nextPage(nextCursor) : undefined}
    />
  );
}

function firstPageWith(params: URLSearchParams, name: string, value: string) {
  const updated = new URLSearchParams(params);
  if (value) updated.set(name, value);
  else updated.delete(name);
  updated.delete('after');
  return updated;
}

function DeckLoadFeedback({
  cards,
  term,
  deckIsGone,
}: Readonly<{ cards: ReturnType<typeof useDeckCards>; term: string; deckIsGone: boolean }>) {
  if (cards.isPending) {
    return (
      <WhenSlow>
        <output className="block">{term ? 'Searching cards…' : 'Loading your deck…'}</output>
      </WhenSlow>
    );
  }
  if (!cards.isError || (cards.isFetchNextPageError && !deckIsGone)) return null;
  let message = 'Your deck couldn’t load. Check your connection and try again.';
  if (deckIsGone) message = 'This deck isn’t in your Library.';
  else if (decksUnavailable(cards.error)) message = DECKS_UNAVAILABLE_TEXT;
  else if (cards.data) message = 'Couldn’t refresh this deck. The cards below may be out of date.';
  else if (term) message = 'Search couldn’t load. Check your connection and try again.';
  return (
    <div className="mb-4">
      <p role="alert" className="mb-4 text-muted">
        {message}
      </p>
      {!deckIsGone && (
        <button
          type="button"
          className={primaryButton}
          onClick={() => void cards.refetch()}
          disabled={cards.isFetching}
        >
          {cards.isFetching ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </div>
  );
}

/** At most one card form is open: a new card or one card's edit. Its text lives here, so it survives moving. */
type CardFormState =
  { kind: 'add'; draft: CardDraft; requestId: string } | { kind: 'edit'; card: DeckCard; draft: CardDraft } | null;
type FocusTarget = 'add' | 'edit' | 'results' | 'settings' | 'settingsHeading' | 'study' | { row: string };
type CardChangeHandler = (cardId: string, edited?: DeckCard) => Promise<void>;

const newCardForm = () => ({ kind: 'add' as const, draft: draftOf(), requestId: crypto.randomUUID() });

const firstCardForm = (deck: Deck, term: string): CardFormState =>
  deck.cardCount === 0 && !deck.archived && !term ? newCardForm() : null;

function emptyMessage(items: DeckCard[] | undefined, term: string, paginated: boolean, dueOnly: boolean) {
  if (items?.length !== 0 || !(term || paginated || dueOnly)) return null;
  if (paginated) return 'There are no cards on this page.';
  if (dueOnly) return term ? 'No due cards match your search.' : 'No cards are due.';
  return 'No cards match your search.';
}

type DeckContentProps = {
  username: string;
  justCreated: boolean;
  arrivalNotice: string | null;
  deck: Deck;
  progress: DeckProgress;
  dueCardIds: string[];
  refreshing: boolean;
  dueOnly: boolean;
  onDueOnly: (dueOnly: boolean) => void;
  unavailable: boolean;
  items: DeckCard[] | undefined;
  view: string;
  term: string;
  onSearch: (value: string, replace?: boolean) => void;
  feedback: ReactNode;
  pagination: ReactNode;
  moreCards: ReactNode;
};

function DeckContent({
  username,
  justCreated,
  arrivalNotice,
  deck,
  progress,
  dueCardIds,
  refreshing,
  dueOnly,
  onDueOnly,
  unavailable,
  items,
  view,
  term,
  onSearch,
  feedback,
  pagination,
  moreCards,
}: Readonly<DeckContentProps>) {
  const addWrite = useDeckWrite();
  const archiveWrite = useDeckWrite();
  const gateway = useDeckGateway();
  const client = useQueryClient();
  const guard = useDeckDraftGuard();
  const requestFocus = useContext(FocusRequestContext);
  const [panes, wide] = useTwoPanes();
  const [notice, setNotice] = useState(arrivalNotice);
  const [form, setForm] = useState<CardFormState>(() => firstCardForm(deck, term));
  const [cardsAdded, setCardsAdded] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(deck.title);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetCard, setSheetCard] = useState<DeckCard | null>(null);
  const [lastView, setLastView] = useState(view);
  const [firstCardFormOpensOnEntry] = useState(() => firstCardForm(deck, term) !== null);
  const settingsId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const startLink = useRef<HTMLAnchorElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const results = useRef<HTMLElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const { listed, editing, cards, selected, firstCard, showDeckTools } = deckView({
    deck,
    unavailable,
    items,
    form,
    selectedId,
  });

  if (lastView !== view) {
    setLastView(view);
    setForm(firstCardForm(deck, term));
    setCardsAdded(0);
    setSettingsOpen(false);
    setNotice(null);
    setSelectedId(null);
    setSheetCard(null);
  }
  // A phone turned sideways can make room for the side pane; the open card moves there.
  if (wide && sheetCard) {
    setSelectedId(sheetCard.id);
    setSheetCard(null);
  }

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === 'study' && (archiveWrite.saving || refreshing || deck.archived)) return;
    pendingFocus.current = null;
    if (target) {
      requestFocus(
        focusElement(target, {
          add: addButton,
          edit: editButton,
          results,
          settings: settingsButton,
          settingsHeading,
          study: startLink.current ? startLink : addButton,
        }),
      );
    }
  });

  const updateDraft = useCallback((draft: CardDraft) => setForm((current) => current && { ...current, draft }), []);

  /**
   * Replaces what the side pane or phone screen shows (a card form or Deck settings), asking first when it
   * has unsaved text. Only one of them is open at a time.
   */
  function replaceForm(next: () => void) {
    const run = () => {
      setForm(null);
      setSettingsOpen(false);
      next();
    };
    if (guard.hasDrafts()) guard.confirm(run);
    else run();
  }

  function openSettings() {
    replaceForm(() => {
      setNotice(null);
      setTitleDraft(deck.title);
      setSettingsOpen(true);
      pendingFocus.current = 'settingsHeading';
    });
  }

  function closeSettings() {
    replaceForm(() => {
      pendingFocus.current = 'settings';
    });
  }

  function settingsChanged(message: string, focusAfter: FocusTarget | null = 'settings') {
    setSettingsOpen(false);
    setNotice(message);
    pendingFocus.current = focusAfter;
  }

  function resume() {
    const save = () => void setArchived(false, 'study');
    if (guard.hasDrafts()) guard.confirm(save);
    else save();
  }

  function setArchived(archived: boolean, focusAfter: FocusTarget | null = 'settings') {
    return archiveWrite.run(
      () => gateway.setArchived(deck.id, archived),
      async () => {
        const pages = { queryKey: deckKeys.cardPages(username, deck.id) };
        const list = { queryKey: deckKeys.list(username) };
        await Promise.all([client.cancelQueries(pages), client.cancelQueries(list)]);
        updateDeckPages(client, pages.queryKey, (page) => ({ ...page, deck: { ...page.deck, archived } }));
        client.setQueryData<Deck[]>(list.queryKey, (decks) =>
          decks?.map((item) => (item.id === deck.id ? { ...item, archived } : item)),
        );
        settingsChanged(archived ? 'Deck paused.' : 'Deck resumed.', focusAfter);
      },
    );
  }

  function openCard(card: DeckCard) {
    if (!wide) {
      setNotice(null);
      setSheetCard(card);
    } else if (editing?.id !== card.id) replaceForm(() => setSelectedId(card.id));
  }

  function startAdd() {
    if (form?.kind === 'add') return;
    replaceForm(() => {
      setNotice(null);
      addWrite.clearProblem();
      setForm(newCardForm());
    });
  }

  function startEdit(card: DeckCard) {
    if (editing?.id === card.id) return;
    replaceForm(() => {
      setNotice(null);
      setSelectedId(card.id);
      setForm({ kind: 'edit', card, draft: draftOf(card) });
    });
  }

  function closeForm(target: FocusTarget) {
    pendingFocus.current = target;
    setForm(null);
  }

  function finishEdit(card: DeckCard, saved?: DeckCard) {
    if (saved && !matchesCardSearch(saved, term)) {
      const neighbor = cardAfterDeletion(listed, card.id);
      setSelectedId(neighbor);
      setSheetCard(null);
      setNotice('Card saved. It no longer matches your search.');
      closeForm(neighbor ? { row: neighbor } : 'results');
      return;
    }
    if (!items?.some((item) => item.id === card.id)) {
      setSheetCard(null);
      closeForm('results');
    } else if (wide) closeForm('edit');
    // On phones the full-screen card returns from its form to the card, which takes focus there.
    else setForm(null);
  }

  const screenBack: ScreenBack = {
    add: () =>
      replaceForm(() => {
        setCardsAdded(0);
        pendingFocus.current = 'add';
      }),
    edit: () => replaceForm(() => undefined),
    settings: closeSettings,
    card: (card) => {
      pendingFocus.current = { row: card.id };
      setSheetCard(null);
    },
  };

  async function applyCardChange(cardId: string, edited?: DeckCard) {
    if (!edited) {
      // Focus moves to the card that takes the deleted one's place, so the list keeps its scroll position.
      const neighbor = cardAfterDeletion(listed, cardId);
      pendingFocus.current = neighbor ? { row: neighbor } : 'results';
      setSelectedId(neighbor);
      setSheetCard(null);
    }
    await updateCachedCards(client, deckKeys.cardPages(username, deck.id), cardId, edited);
    setNotice(edited ? 'Card saved.' : 'Card deleted.');
  }

  const addForm = form?.kind === 'add' && (
    <CardForm
      prepareWrite={gateway.prepareWrite}
      key={cardsAdded}
      heading="New card"
      added={cardsAdded > 0}
      draft={form.draft}
      writeState={addWrite.state}
      onDraftChange={updateDraft}
      beforeFields={<PasteCardsLink deckId={deck.id} />}
      onSave={(draft) =>
        void addWrite.run(
          () => gateway.addCard(deck.id, draft, form.requestId),
          () => {
            setCardsAdded((count) => count + 1);
            setForm(newCardForm());
          },
        )
      }
      onCancel={() => {
        setCardsAdded(0);
        closeForm('add');
      }}
    />
  );
  const editForm = form?.kind === 'edit' && (
    <EditCard
      key={form.card.id}
      card={form.card}
      draft={form.draft}
      onDraftChange={updateDraft}
      onChanged={applyCardChange}
      onClose={(saved) => finishEdit(form.card, saved)}
    />
  );
  const settings = settingsOpen && (
    <DeckSettings
      deck={deck}
      titleDraft={titleDraft}
      onTitleDraftChange={setTitleDraft}
      headingRef={settingsHeading}
      archiveState={archiveWrite.state}
      onArchiveChange={(archived) => setArchived(archived)}
      onChanged={settingsChanged}
      onClose={wide ? closeSettings : undefined}
    />
  );
  const cardControls = (card: DeckCard, questionId: string, place: ControlPlace): CardControls => ({
    edit: (
      <EditCardButton
        ref={place === 'pane' ? editButton : undefined}
        questionId={questionId}
        place={place}
        onEdit={() => startEdit(card)}
      />
    ),
    remove: (
      <DeleteCard
        key={card.id}
        card={card}
        questionId={questionId}
        place={place}
        onDeleted={() => applyCardChange(card.id)}
      />
    ),
  });

  return (
    <WorkspacePage
      title={unavailable ? 'Deck' : deck.title}
      focusHeading={!firstCardFormOpensOnEntry}
      {...deckHeading(justCreated && firstCard, deck, progress)}
    >
      {showDeckTools && (
        <DeckToolbar
          wide={wide}
          deck={deck}
          progress={progress}
          term={term}
          onSearch={(value) => onSearch(value, Boolean(term))}
          onClearSearch={() => onSearch('')}
          addButton={addButton}
          startLink={startLink}
          resuming={archiveWrite.saving}
          onAdd={startAdd}
          onResume={resume}
          settings={{
            id: settingsId,
            open: settingsOpen,
            onToggle: settingsOpen ? closeSettings : openSettings,
          }}
          settingsButton={settingsButton}
          pagination={wide && pagination}
        />
      )}
      <DeckNotice notice={notice} />
      {!settingsOpen && <DeckWriteProblem state={archiveWrite.state} />}
      {feedback}
      <DeckCards
        layout={{ wide, firstCard, panes }}
        addForm={addForm}
        editForm={editForm}
        formLabel={form?.kind === 'add' ? 'New card' : 'Edit card'}
        list={{
          cards,
          dueIds: new Set(dueCardIds),
          emptyMessage: emptyMessage(items, term, Boolean(pagination), dueOnly),
          onOpen: openCard,
          results,
          filter: (dueOnly || (!deck.archived && progress.dueCards > 0)) && (
            <DueFilter dueOnly={dueOnly} onChange={onDueOnly} />
          ),
        }}
        moreCards={wide || unavailable ? null : moreCards}
        selected={settingsOpen ? null : selected}
        settings={settings}
        settingsId={settingsId}
        settingsHeading={settingsHeading}
        sheetCard={sheetCard && (listed.find((card) => card.id === sheetCard.id) ?? sheetCard)}
        controls={cardControls}
        notice={notice}
        back={screenBack}
      />
    </WorkspacePage>
  );
}

function deckHeading(firstCardAfterCreate: boolean, deck: Deck, progress: DeckProgress) {
  if (firstCardAfterCreate) return { aboveTitle: <CreateDeckSteps current={2} /> };
  return { subtitle: <DeckStatus deck={deck} progress={progress} /> };
}

type DeckViewInput = {
  deck: Deck;
  unavailable: boolean;
  items: DeckCard[] | undefined;
  form: CardFormState;
  selectedId: string | null;
};

function deckView({ deck, unavailable, items, form, selectedId }: DeckViewInput) {
  const listed = items ?? [];
  const editing = form?.kind === 'edit' ? form.card : null;
  // A refreshed page or search can omit the card being edited; keep its row until the form closes.
  const editedRowMissing = editing !== null && !listed.some((card) => card.id === editing.id);
  const cards = editedRowMissing ? [...listed, editing] : listed;
  const selected = editing ?? cards.find((card) => card.id === selectedId) ?? cards[0] ?? null;
  const adding = form?.kind === 'add';
  const firstCard = adding && deck.cardCount === 0;
  const showDeckTools = !unavailable && !firstCard;
  return { listed, editing, cards, selected, firstCard, showDeckTools };
}

type FocusElements = Record<Exclude<FocusTarget, { row: string }>, RefObject<HTMLElement | null>>;

function focusElement(target: FocusTarget, elements: FocusElements) {
  if (typeof target === 'object') return document.querySelector<HTMLElement>(`[data-card-row="${target.row}"]`);
  return elements[target].current;
}

const twoPanes =
  'mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start gap-4 @min-[60rem]:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)] @min-[60rem]:gap-6';
const onePane = 'mt-2 grid gap-3';

function cardAfterDeletion(cards: DeckCard[], cardId: string) {
  const index = cards.findIndex((card) => card.id === cardId);
  return (cards[index + 1] ?? cards[index - 1])?.id ?? null;
}

function PasteCardsLink({ deckId }: Readonly<{ deckId: string }>) {
  return (
    <Link
      to={pasteCardsPath(deckId)}
      className="pressable flex min-h-12 items-center gap-3 rounded-control bg-accent-soft px-3 py-2 text-label font-semibold text-accent-strong"
    >
      <ClipboardPaste aria-hidden="true" className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 wrap-anywhere">Paste many cards at once</span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
    </Link>
  );
}

/** Always present, so screen readers announce each new message without focus moving to it. */
function DeckNotice({ notice }: Readonly<{ notice: string | null }>) {
  return (
    <output
      className={
        notice
          ? 'my-3 block rounded-control bg-accent-soft p-compact-gutter text-support text-accent-strong'
          : 'sr-only'
      }
    >
      {notice}
    </output>
  );
}

type DeckCardsProps = {
  moreCards: ReactNode;
  layout: { wide: boolean; firstCard: boolean; panes: (element: HTMLElement | null) => void };
  addForm: ReactNode;
  editForm: ReactNode;
  formLabel: string;
  list: {
    cards: DeckCard[];
    dueIds: ReadonlySet<string>;
    emptyMessage: string | null;
    onOpen: (card: DeckCard) => void;
    results: Ref<HTMLElement>;
    filter: ReactNode;
  };
  selected: DeckCard | null;
  settings: ReactNode;
  settingsId: string;
  settingsHeading: RefObject<HTMLHeadingElement | null>;
  sheetCard: DeckCard | null;
  controls: (card: DeckCard, questionId: string, place: ControlPlace) => CardControls;
  notice: string | null;
  back: ScreenBack;
};

function DeckCards({
  layout: { wide, firstCard, panes },
  moreCards,
  addForm,
  editForm,
  formLabel,
  list,
  selected,
  settings,
  settingsId,
  settingsHeading,
  sheetCard,
  controls,
  notice,
  back,
}: Readonly<DeckCardsProps>) {
  if (firstCard) return <div className="max-w-3xl">{addForm}</div>;
  const form = addForm || editForm;
  return (
    <>
      <div ref={panes} className={wide ? twoPanes : onePane}>
        <DeckCardList
          cards={list.cards}
          dueIds={list.dueIds}
          filter={list.filter}
          emptyMessage={list.emptyMessage}
          wide={wide}
          selectedId={selected?.id ?? null}
          onOpen={list.onOpen}
          resultsRef={list.results}
        />
        {moreCards}
        {wide && (
          <CardPane form={form} settings={settings} settingsId={settingsId} card={selected} controls={controls} />
        )}
      </div>
      {!wide && (
        <PhoneCardScreen
          form={form}
          formLabel={formLabel}
          settings={settings}
          settingsId={settingsId}
          settingsHeading={settingsHeading}
          card={sheetCard}
          due={sheetCard !== null && list.dueIds.has(sheetCard.id)}
          controls={controls}
          notice={notice}
          back={back}
        />
      )}
    </>
  );
}

type ControlPlace = 'pane' | 'screen';

type PhoneCardScreenProps = {
  form: ReactNode;
  formLabel: string;
  settings: ReactNode;
  settingsId: string;
  settingsHeading: RefObject<HTMLHeadingElement | null>;
  card: DeckCard | null;
  due: boolean;
  controls: (card: DeckCard, questionId: string, place: ControlPlace) => CardControls;
  notice: string | null;
  back: ScreenBack;
};

type ScreenBack = { add: () => void; edit: () => void; settings: () => void; card: (card: DeckCard) => void };

function PhoneCardScreen({
  form,
  formLabel,
  settings,
  settingsId,
  settingsHeading,
  card,
  due,
  controls,
  notice,
  back,
}: Readonly<PhoneCardScreenProps>) {
  const questionId = useId();
  const question = useRef<HTMLHeadingElement>(null);
  if (settings) {
    return (
      <CardScreen
        label="Deck settings"
        backLabel="Cards"
        onBack={back.settings}
        view="settings"
        focusTarget={settingsHeading}
      >
        <div id={settingsId} className="rounded-card bg-surface p-5 shadow-card">
          {settings}
        </div>
      </CardScreen>
    );
  }
  if (form) {
    return (
      <CardScreen
        label={formLabel}
        backLabel={card ? 'Card' : 'Cards'}
        onBack={formLabel === 'New card' ? back.add : back.edit}
        formActionsInBar
        view={formLabel}
      >
        {form}
      </CardScreen>
    );
  }
  if (!card) return null;
  const { edit, remove } = controls(card, questionId, 'screen');
  return (
    <CardScreen
      label={card.question}
      backLabel="Cards"
      onBack={() => back.card(card)}
      topAction={edit}
      view={`card-${card.id}`}
      focusTarget={question}
    >
      {/* The page's own notice is hidden behind this screen, so a saved edit is confirmed here too. */}
      {notice && (
        <p className="mb-4 rounded-control bg-accent-soft p-compact-gutter text-support text-accent-strong">{notice}</p>
      )}
      <div className="rounded-card bg-surface p-5 shadow-card">
        <CardPreview card={card} questionId={questionId} due={due} questionRef={question} />
      </div>
      <div className="mt-4">{remove}</div>
    </CardScreen>
  );
}

type CardPaneProps = {
  form: ReactNode;
  settings: ReactNode;
  settingsId: string;
  card: DeckCard | null;
  controls: (card: DeckCard, questionId: string, place: ControlPlace) => CardControls;
};

const paneBelowStickyToolbar = 'sticky top-[4.5rem] max-h-[calc(100dvh-5.5rem)] min-w-0 overflow-y-auto';

function CardPane({ form, settings, settingsId, card, controls }: Readonly<CardPaneProps>) {
  const questionId = useId();
  if (form) return <div className={`${paneBelowStickyToolbar} -m-1 p-1`}>{form}</div>;
  if (settings) {
    return (
      <section
        id={settingsId}
        aria-label="Deck settings"
        className={`${paneBelowStickyToolbar} rounded-card bg-surface p-5 shadow-card @min-[60rem]:px-8`}
      >
        {settings}
      </section>
    );
  }
  if (!card) return null;
  const { edit, remove } = controls(card, questionId, 'pane');
  return (
    <section aria-label="Selected card" className={`${paneBelowStickyToolbar} rounded-card bg-surface shadow-card`}>
      {/* Edit and Delete lead the pane, so they are on screen even when a long card runs past the fold. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 @min-[60rem]:px-8">
        {edit}
        {remove}
      </div>
      <div className="px-5 pt-2 pb-5 @min-[60rem]:px-8">
        <CardPreview card={card} questionId={questionId} />
      </div>
    </section>
  );
}

const editButtonStyle: Record<ControlPlace, string> = {
  pane: `${secondaryButton} flex-1 basis-32 border border-line shadow-none`,
  screen:
    'pressable inline-flex min-h-12 items-center gap-1.5 rounded-control bg-accent-soft px-4 text-label font-bold text-accent-strong',
};

type EditCardButtonProps = {
  ref?: Ref<HTMLButtonElement>;
  questionId: string;
  place: ControlPlace;
  onEdit: () => void;
};

function EditCardButton({ ref, questionId, place, onEdit }: Readonly<EditCardButtonProps>) {
  return (
    <button ref={ref} type="button" aria-describedby={questionId} className={editButtonStyle[place]} onClick={onEdit}>
      <Pencil aria-hidden="true" className="size-[1.125em] shrink-0" />
      Edit card
    </button>
  );
}

const deleteButtonStyle: Record<ControlPlace, string | undefined> = {
  pane: undefined,
  screen:
    'pressable inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control px-3 text-label font-semibold text-missed',
};

type DeleteCardProps = {
  card: DeckCard;
  questionId: string;
  place: ControlPlace;
  onDeleted: () => Promise<void>;
};

function DeleteCard({ card, questionId, place, onDeleted }: Readonly<DeleteCardProps>) {
  const gateway = useDeckGateway();
  const write = useDeckWrite();
  return (
    <ConfirmDelete
      describedBy={questionId}
      triggerLabel="Delete"
      triggerIcon={Trash2}
      triggerClassName={deleteButtonStyle[place]}
      subject={card.question}
      warning="This permanently removes the card and its review progress."
      keepLabel="Keep card"
      confirmLabel="Delete card"
      deleting={write.saving}
      problem={<DeckWriteProblem state={write.state} />}
      onOpen={write.clearProblem}
      onConfirm={(close) =>
        void write.run(
          () => gateway.removeCard(card.id),
          async () => {
            close();
            await onDeleted();
          },
        )
      }
    />
  );
}

type EditCardProps = {
  card: DeckCard;
  draft: CardDraft;
  onDraftChange: (draft: CardDraft) => void;
  onChanged: CardChangeHandler;
  onClose: (saved?: DeckCard) => void;
};

function EditCard({ card, draft, onDraftChange, onChanged, onClose }: Readonly<EditCardProps>) {
  const gateway = useDeckGateway();
  const write = useDeckWrite();
  return (
    <CardForm
      prepareWrite={gateway.prepareWrite}
      heading="Edit card"
      card={card}
      writeState={write.state}
      draft={draft}
      onDraftChange={onDraftChange}
      onSave={(saved) =>
        void write.run(
          () => gateway.editCard(card.id, saved, card.contentVersion),
          async (edited) => {
            await onChanged(card.id, edited);
            onClose(edited);
          },
        )
      }
      onCancel={() => onClose()}
    />
  );
}
