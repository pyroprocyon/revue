import { Pencil } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeckDraftGuard } from './UnsavedDeckChanges';
import {
  Suspense,
  lazy,
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
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import type { CardDraft, Deck, DeckCard, DeckProgress } from '../application/decks';
import { draftOf } from './cardDraft';
import { CardPreview } from './CardPreview';
import { CardScreen, CardScreenBar, type CardControls } from './CardScreen';
import { InlineCardDelete } from './InlineCardDelete';
import { DeckCardList, DeckCardsHeader } from './DeckCardList';
import { belowToolbar, cardPaneGutters, onePane, paneBelowStickyToolbar, twoPanes } from './cardBrowserLayout';
import { useDeckGateway } from './DeckProvider';
import { DeckStatus, DeckToolbar } from './DeckToolbar';
import { DeckWriteProblem } from './DeckWriteProblem';
import { matchesCardSearch, updateCachedCards, updateDeckPages, useDeckWrite } from './useDecks';
import { useTwoPanes } from './useTwoPanes';
import { deckKeys } from '../../../shared/cache/queryKeys';
import { LIBRARY_PATH } from '../../../shared/navigation/paths';
import { useSessionExpiredRedirect } from '../../../shared/navigation/SessionExpiredRedirect';
import { routeState } from '../../../shared/navigation/routeState';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { WhenSlow } from '../../../shared/ui/WhenSlow';

const CardForm = lazy(() => import('./CardForm').then(({ CardForm }) => ({ default: CardForm })));
const DeckSettings = lazy(() => import('./DeckSettings').then(({ DeckSettings }) => ({ default: DeckSettings })));
const CreateDeckSteps = lazy(() =>
  import('./CreateDeckSteps').then(({ CreateDeckSteps }) => ({ default: CreateDeckSteps })),
);

/**
 * At most one card form is open: a new card or one card's edit. Its text and save live here, so they survive moving
 * between the phone screen and the side pane. A save can answer after its form closed and another opened, so each
 * opening has its own id and a save finishes only the form that sent it.
 */
type CardFormState =
  | { kind: 'add'; draft: CardDraft; requestId: string }
  | { kind: 'edit'; card: DeckCard; draft: CardDraft; openingId: string }
  | null;
type EditForm = Extract<CardFormState, { kind: 'edit' }>;
type FocusTarget = 'add' | 'edit' | 'results' | 'settings' | 'settingsHeading' | 'study' | { row: string };

const newCardForm = () => ({ kind: 'add' as const, draft: draftOf(), requestId: crypto.randomUUID() });
const editCardForm = (card: DeckCard): EditForm => ({
  kind: 'edit',
  card,
  draft: draftOf(card),
  openingId: crypto.randomUUID(),
});

const firstCardForm = (deck: Deck, term: string, justCreated: boolean): CardFormState =>
  justCreated && deck.cardCount === 0 && !deck.archived && !term ? newCardForm() : null;

function emptyMessage(items: DeckCard[] | undefined, term: string, paginated: boolean, dueOnly: boolean) {
  if (items?.length !== 0 || !(term || paginated || dueOnly)) return null;
  if (paginated) return 'There are no cards on this page.';
  if (dueOnly) return term ? 'No due cards match your search.' : 'No cards are due.';
  return 'No cards match your search.';
}

type DeckContentProps = {
  username: string;
  justCreated: boolean;
  deck: Deck;
  progress: DeckProgress;
  dueCardIds: string[];
  refreshing: boolean;
  dueOnly: boolean;
  filter: ReactNode;
  unavailable: boolean;
  items: DeckCard[] | undefined;
  view: string;
  term: string;
  onSearch: (value: string, replace?: boolean) => void;
  feedback: ReactNode;
  pagination: ReactNode;
  moreCards: ReactNode;
};

export function DeckContent({
  username,
  justCreated,
  deck,
  progress,
  dueCardIds,
  refreshing,
  dueOnly,
  filter,
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
  const editWrite = useDeckWrite();
  const deleteWrite = useDeckWrite();
  const archiveWrite = useDeckWrite();
  const gateway = useDeckGateway();
  const client = useQueryClient();
  const guard = useDeckDraftGuard();
  const requestFocus = useContext(FocusRequestContext);
  const location = useLocation();
  const navigate = useNavigate();
  const redirectAfterExpiration = useSessionExpiredRedirect();
  const [panes, wide, panesMeasured] = useTwoPanes();
  const [openedRightAfterCreate] = useState(justCreated);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<CardFormState>(() => firstCardForm(deck, term, openedRightAfterCreate));
  const [cardsAdded, setCardsAdded] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(deck.title);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetCard, setSheetCard] = useState<DeckCard | null>(null);
  const [lastView, setLastView] = useState(view);
  const [toolbarBottom, setToolbarBottom] = useState<number | null>(null);
  const [firstCardFormOpensOnEntry] = useState(() => firstCardForm(deck, term, openedRightAfterCreate) !== null);
  const settingsId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const startLink = useRef<HTMLAnchorElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const results = useRef<HTMLElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const settingsHeading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const setSettingsHeading = useCallback(
    (element: HTMLHeadingElement | null) => {
      settingsHeading.current = element;
      if (element && pendingFocus.current === 'settingsHeading') {
        pendingFocus.current = null;
        requestFocus(element);
      }
    },
    [requestFocus],
  );
  const openForm = useRef<CardFormState>(form);
  const { listed, editing, cards, selected, firstCard, showDeckTools } = deckView({
    deck,
    unavailable,
    items,
    form,
    selectedId,
  });

  useEffect(() => {
    openForm.current = form;
  });

  useEffect(() => {
    if (deleteWrite.state.status === 'failed' && deleteWrite.state.reason === 'signed-out') {
      redirectAfterExpiration(LIBRARY_PATH);
    }
  }, [deleteWrite.state, redirectAfterExpiration]);

  // Back, Forward and reload must not open the first card again, so the page keeps the flag and the entry drops it.
  useEffect(() => {
    if (routeState(location).createdDeck) {
      void navigate(location, { replace: true, state: { ...routeState(location), createdDeck: undefined } });
    }
  }, [location, navigate]);

  if (lastView !== view) {
    setLastView(view);
    setForm(null);
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
    if (target === 'settingsHeading' && !settingsHeading.current) return;
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

  function stillOpen(opening: string) {
    const current = openForm.current;
    return (current?.kind === 'add' ? current.requestId : current?.openingId) === opening;
  }

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
      editWrite.clearProblem();
      setForm(editCardForm(card));
    });
  }

  function closeForm(target: FocusTarget) {
    pendingFocus.current = target;
    setForm(null);
  }

  function saveEdit({ card, openingId }: EditForm, draft: CardDraft) {
    void editWrite.run(
      () => gateway.editCard(card.id, draft, card.contentVersion),
      async (edited) => {
        await updateCachedCards(client, deckKeys.cardPages(username, deck.id), card.id, edited);
        setNotice('Card saved.');
        finishEdit(openingId, edited);
      },
      () => stillOpen(openingId),
    );
  }

  function finishEdit(openingId: string, saved?: DeckCard) {
    const current = openForm.current;
    if (current?.kind !== 'edit') return;
    if (current.openingId !== openingId) {
      if (saved?.id === current.card.id && saved.contentVersion > current.card.contentVersion) {
        setForm(editCardForm(saved));
      }
      return;
    }
    const { card } = current;
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

  function deleteCard(cardId: string, confirmation: HTMLFormElement) {
    void deleteWrite.run(
      () => gateway.removeCard(cardId),
      async () => {
        if (confirmation.isConnected) {
          const neighbor = cardAfterDeletion(listed, cardId);
          if (confirmation.contains(document.activeElement) || document.activeElement === document.body) {
            pendingFocus.current = neighbor ? { row: neighbor } : 'results';
          }
          setSelectedId(neighbor);
        }
        setSheetCard((shown) => (shown?.id === cardId ? null : shown));
        await updateCachedCards(client, deckKeys.cardPages(username, deck.id), cardId);
        setNotice('Card deleted.');
      },
      () => confirmation.isConnected,
    );
  }

  const addForm = form?.kind === 'add' && (
    <DeferredPanel label="Loading card editor…" onCancel={screenBack.add}>
      <CardForm
        prepareWrite={gateway.prepareWrite}
        key={cardsAdded}
        heading="New card"
        added={cardsAdded > 0}
        draft={form.draft}
        writeState={addWrite.state}
        onDraftChange={updateDraft}
        onSave={(draft) => {
          const { requestId } = form;
          void addWrite.run(
            () => gateway.addCard(deck.id, draft, requestId),
            () => {
              if (!stillOpen(requestId)) return;
              setCardsAdded((count) => count + 1);
              setForm(newCardForm());
            },
            () => stillOpen(requestId),
          );
        }}
        onCancel={() => {
          setCardsAdded(0);
          closeForm('add');
        }}
      />
    </DeferredPanel>
  );
  const editForm = form?.kind === 'edit' && (
    <DeferredPanel label="Loading card editor…" onCancel={() => finishEdit(form.openingId)}>
      <CardForm
        prepareWrite={gateway.prepareWrite}
        key={form.openingId}
        heading="Edit card"
        card={form.card}
        draft={form.draft}
        writeState={editWrite.state}
        onDraftChange={updateDraft}
        onSave={(draft) => saveEdit(form, draft)}
        onCancel={() => finishEdit(form.openingId)}
      />
    </DeferredPanel>
  );
  const settings = settingsOpen && (
    <DeferredPanel label="Loading deck settings…">
      <DeckSettings
        deck={deck}
        titleDraft={titleDraft}
        onTitleDraftChange={setTitleDraft}
        headingRef={setSettingsHeading}
        archiveState={archiveWrite.state}
        onArchiveChange={(archived) => setArchived(archived)}
        onChanged={settingsChanged}
        onClose={wide ? closeSettings : undefined}
      />
    </DeferredPanel>
  );
  const cardControls = (card: DeckCard, questionId: string, place: ControlPlace): CardControls => ({
    edit: (
      <EditCardButton
        ref={place === 'pane' ? editButton : undefined}
        questionId={questionId}
        place={place}
        disabled={deleteWrite.saving}
        onEdit={() => startEdit(card)}
      />
    ),
    remove: (
      <div className="mt-5 border-t border-line pt-4">
        <InlineCardDelete
          key={card.id}
          questionId={questionId}
          writeState={deleteWrite.state}
          onOpen={deleteWrite.clearProblem}
          onDelete={(confirmation) => deleteCard(card.id, confirmation)}
        />
      </div>
    ),
  });

  return (
    <WorkspacePage
      title={unavailable ? 'Deck' : deck.title}
      focusHeading={!firstCardFormOpensOnEntry}
      {...deckHeading(openedRightAfterCreate && firstCard, deck, progress)}
    >
      {openedRightAfterCreate && firstCard && (
        <Suspense fallback={null}>
          <CreateDeckSteps current={2} />
        </Suspense>
      )}
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
          filter={!wide && filter}
          stickyBottom={toolbarBottom}
          onHeldBottomChange={setToolbarBottom}
        />
      )}
      <DeckNotice notice={notice} />
      {!settingsOpen && <DeckWriteProblem state={archiveWrite.state} />}
      {feedback}
      <DeckCards
        layout={{ wide, firstCard, panes, measured: panesMeasured, toolbarBottom, showDeckTools }}
        addForm={addForm}
        editForm={editForm}
        formLabel={form?.kind === 'add' ? 'New card' : 'Edit card'}
        list={{
          cards,
          dueIds: new Set(dueCardIds),
          emptyMessage: emptyMessage(items, term, Boolean(pagination), dueOnly),
          onOpen: openCard,
          results,
          filter,
          pagination,
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

function DeferredPanel({
  label,
  children,
  onCancel,
}: Readonly<{ label: string; children: ReactNode; onCancel?: () => void }>) {
  const bar = useContext(CardScreenBar);
  const cancel = onCancel && (
    <button type="button" className={secondaryButton} onClick={onCancel}>
      Cancel
    </button>
  );
  return (
    <Suspense
      fallback={
        <>
          {bar?.slot ? createPortal(cancel, bar.slot) : cancel}
          <WhenSlow>
            <LoadingStatus>{label}</LoadingStatus>
          </WhenSlow>
        </>
      }
    >
      {children}
    </Suspense>
  );
}

const backToLibrary = (
  <NavigationLink to={LIBRARY_PATH} back aria-label="Back to Library" className="workspace-page-back -mt-2 -ml-2 mb-1">
    Library
  </NavigationLink>
);

function deckHeading(firstCardAfterCreate: boolean, deck: Deck, progress: DeckProgress) {
  if (firstCardAfterCreate) return { aboveTitle: backToLibrary };
  return { aboveTitle: backToLibrary, subtitle: <DeckStatus deck={deck} progress={progress} /> };
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

function cardAfterDeletion(cards: DeckCard[], cardId: string) {
  const index = cards.findIndex((card) => card.id === cardId);
  return (cards[index + 1] ?? cards[index - 1])?.id ?? null;
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
  layout: {
    wide: boolean;
    firstCard: boolean;
    measured: boolean;
    panes: (element: HTMLElement | null) => void;
    toolbarBottom: number | null;
    showDeckTools: boolean;
  };
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
    pagination: ReactNode;
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
  layout: { wide, firstCard, measured, panes, toolbarBottom, showDeckTools },
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
  // The first card waits for the width check, so a desktop never opens the phone editor before switching.
  if (firstCard && !measured) return <div ref={panes} />;
  if (firstCard && wide) {
    return (
      <div ref={panes} className="max-w-3xl">
        {addForm}
      </div>
    );
  }
  const form = addForm || editForm;
  return (
    <>
      <div ref={panes} className={wide ? twoPanes : onePane} style={belowToolbar(toolbarBottom)}>
        <DeckCardsHeader
          filter={(wide || !showDeckTools) && list.filter}
          pagination={wide && showDeckTools && list.pagination}
        />
        <DeckCardList
          cards={list.cards}
          dueIds={list.dueIds}
          emptyMessage={list.emptyMessage}
          wide={wide}
          selectedId={selected?.id ?? null}
          onOpen={list.onOpen}
          resultsRef={list.results}
        />
        {moreCards}
        {wide && (
          <CardPane
            sticky={toolbarBottom !== null}
            form={form}
            settings={settings}
            settingsId={settingsId}
            card={selected}
            controls={controls}
          />
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
        {remove}
      </div>
    </CardScreen>
  );
}

type CardPaneProps = {
  sticky: boolean;
  form: ReactNode;
  settings: ReactNode;
  settingsId: string;
  card: DeckCard | null;
  controls: (card: DeckCard, questionId: string, place: ControlPlace) => CardControls;
};

function CardPane({ sticky, form, settings, settingsId, card, controls }: Readonly<CardPaneProps>) {
  const paneStyle = sticky ? paneBelowStickyToolbar : 'min-w-0';
  const questionId = useId();
  if (form) return <div className={`${paneStyle} -m-1 p-1`}>{form}</div>;
  if (settings) {
    return (
      <section
        id={settingsId}
        aria-label="Deck settings"
        className={`${paneStyle} ${cardPaneGutters} rounded-card bg-surface py-5 shadow-card`}
      >
        {settings}
      </section>
    );
  }
  if (!card) return null;
  const { edit, remove } = controls(card, questionId, 'pane');
  return (
    <section aria-label="Selected card" className={`${paneStyle} rounded-card bg-surface shadow-card`}>
      <div className={`${cardPaneGutters} flex border-b border-line py-3`}>{edit}</div>
      <div className={`${cardPaneGutters} pt-2 pb-5`}>
        <CardPreview card={card} questionId={questionId} />
        {remove}
      </div>
    </section>
  );
}

const editButtonStyle: Record<ControlPlace, string> = {
  pane: `${secondaryButton} flex-1 basis-32 border border-line shadow-none`,
  screen:
    'pressable tonal-control-gradient inline-flex min-h-12 items-center gap-1.5 rounded-control bg-accent-soft px-4 text-label font-bold text-accent-strong',
};

type EditCardButtonProps = {
  ref?: Ref<HTMLButtonElement>;
  questionId: string;
  place: ControlPlace;
  disabled: boolean;
  onEdit: () => void;
};

function EditCardButton({ ref, questionId, place, disabled, onEdit }: Readonly<EditCardButtonProps>) {
  return (
    <button
      ref={ref}
      type="button"
      aria-describedby={questionId}
      className={`${editButtonStyle[place]} disabled:cursor-wait disabled:opacity-60`}
      disabled={disabled}
      onClick={onEdit}
    >
      <Pencil aria-hidden="true" className="size-[1.125em] shrink-0" />
      Edit card
    </button>
  );
}
