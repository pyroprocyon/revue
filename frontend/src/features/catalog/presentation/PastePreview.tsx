import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  ImageOff,
  Trash2,
  Undo2,
  VolumeX,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { useNavigate } from 'react-router';
import { CARD_FIELD_MAX_LENGTH, type CardToImport } from '../application/decks';
import {
  cardProblems,
  needsFix,
  type CardProblems,
  type PastedCard,
  type RemovedMedia,
} from '../application/pastedCards';
import { twoPanes } from './cardBrowserLayout';
import { useDeckGateway } from './DeckProvider';
import { DeckWriteProblem } from './DeckWriteProblem';
import { PasteDock } from './PasteDock';
import { ROW_SELECTION_HINT, moveRowSelection } from './rowSelection';
import { TextField } from './TextField';
import { DECKS_UNAVAILABLE_TEXT } from './decksUnavailable';
import { useDeckWrite, type DeckWriteState } from './useDecks';
import { useTwoPanes } from './useTwoPanes';
import { deckKeys } from '../../../shared/cache/queryKeys';
import { deckPath } from '../../../shared/navigation/paths';
import { importedCardsState } from '../../../shared/navigation/routeState';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { cardCountLabel, cardNoun } from '../../../shared/ui/cardCount';
import { useStillMounted } from '../../../shared/ui/useStillMounted';

/** The import waits until the deck is found, so the learner sees where the cards go before they save. */
export type ImportDestination =
  | { status: 'found'; title: string }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; unavailable: boolean; retrying: boolean; onRetry: () => void };
type UnconfirmedDestination = Exclude<ImportDestination, { status: 'found' }>;
type PreviewRow = PastedCard & { key: number };
type RemovedRow = { row: PreviewRow; index: number };
type FocusTarget = { part: 'undo' } | { part: 'header' | 'problem'; key: number };
type ProblemText = { [Field in keyof CardProblems]: Record<NonNullable<CardProblems[Field]>, string> };

const FIELD_PROBLEM_TEXT: ProblemText = {
  question: {
    missing: 'Add a question.',
    'too-long': `Shorten the question to ${CARD_FIELD_MAX_LENGTH.question} characters.`,
  },
  answer: {
    missing: 'Add an answer.',
    'too-long': `Shorten the answer to ${CARD_FIELD_MAX_LENGTH.answer} characters.`,
  },
  explanation: {
    'too-long': `Shorten the explanation to ${CARD_FIELD_MAX_LENGTH.explanation.toLocaleString('en-US')} characters.`,
  },
};

const ROW_PROBLEM_TEXT: ProblemText = {
  question: { missing: 'Needs a question', 'too-long': 'Question too long' },
  answer: { missing: 'Needs an answer', 'too-long': 'Answer too long' },
  explanation: { 'too-long': 'Explanation too long' },
};

type PastePreviewProps = {
  username: string;
  deckId: string;
  destination: ImportDestination;
  requestId: string;
  cards: PastedCard[];
  /** Receives the cards when the learner changed them here, so the text can keep those changes. */
  onEditText: (editedCards: PastedCard[] | null) => void;
  onImported: () => void;
};

export function PastePreview({
  username,
  deckId,
  destination,
  requestId,
  cards,
  onEditText,
  onImported,
}: Readonly<PastePreviewProps>) {
  const gateway = useDeckGateway();
  const client = useQueryClient();
  const navigate = useNavigate();
  const requestFocus = useContext(FocusRequestContext);
  const stillMounted = useStillMounted();
  const write = useDeckWrite();
  const [rows, setRows] = useState<PreviewRow[]>(() => cards.map((card, key) => ({ ...card, key })));
  const [openKey, setOpenKey] = useState<number | null>(() => firstKeyNeedingFix(rows));
  const [edited, setEdited] = useState(false);
  const [removed, setRemoved] = useState<RemovedRow | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [panes, wide] = useTwoPanes();
  const cardArea = useRef<HTMLFieldSetElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const keysHintId = useId();
  const cardsToFix = rows.filter(needsFix).length;
  const paneRow = wide ? rowInPane(rows, openKey) : undefined;
  const listOpenKey = wide ? null : openKey;

  useEffect(() => {
    if (focusTarget === null) return;
    const target = focusTarget.part === 'undo' ? undoButton.current : previewCardPart(cardArea.current, focusTarget);
    requestFocus(target);
    scrollClearOfDock(target, dock.current);
  }, [focusTarget, requestFocus]);

  function updateRow(key: number, change: Partial<PastedCard>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setEdited(true);
  }

  function toggle(key: number) {
    setOpenKey(openKey === key ? null : key);
    setFocusTarget({ part: 'header', key });
  }

  function openCard(key: number) {
    if (wide) setOpenKey(key);
    else toggle(key);
  }

  function remove(row: PreviewRow) {
    setRemoved({ row, index: rows.indexOf(row) });
    setRows(rows.filter((item) => item !== row));
    setEdited(true);
    setAnnouncement('Card removed.');
    setFocusTarget({ part: 'undo' });
  }

  function undoRemoval(restore: RemovedRow) {
    setRows([...rows.slice(0, restore.index), restore.row, ...rows.slice(restore.index)]);
    setRemoved(null);
    setOpenKey(restore.row.key);
    setAnnouncement('Card restored.');
    setFocusTarget({ part: 'header', key: restore.row.key });
  }

  function showFirstCardToFix() {
    const key = firstKeyNeedingFix(rows);
    if (key === null) return;
    setOpenKey(key);
    setFocusTarget({ part: 'problem', key });
  }

  function confirmImport() {
    if (cardsToFix > 0) {
      showFirstCardToFix();
      return;
    }
    const confirmed = rows.map(cardToImport);
    void write.run(
      () => gateway.importCards(deckId, confirmed, requestId),
      (result) => {
        if (!stillMounted.current) return;
        onImported();
        client.removeQueries({ queryKey: deckKeys.cardPages(username, deckId) });
        void navigate(deckPath(deckId), { replace: true, state: importedCardsState(result.importedCards) });
      },
    );
  }

  const items = listWithRemovedPlaceholder(rows, removed);
  return (
    <WorkspacePage
      title="Preview cards"
      aboveTitle={<EditTextButton onClick={() => onEditText(edited ? rows : null)} disabled={write.saving} />}
      subtitle={<PreviewSummary cardCount={rows.length} destination={destination} />}
      status={
        rows.length > 0 && (
          <PreviewStatus
            cardsToFix={cardsToFix}
            canImport={destination.status === 'found'}
            onShowCardToFix={showFirstCardToFix}
          />
        )
      }
    >
      <fieldset ref={cardArea} disabled={write.saving} aria-busy={write.saving} className="grid min-w-0 gap-3">
        <output className="sr-only">{announcement}</output>
        {rows.length === 0 && (
          <p className="text-body text-muted">No cards left to import. Undo a removal or edit your text.</p>
        )}
        <div ref={panes} className={wide ? twoPanes : 'grid'}>
          <ol aria-label="Cards to import" className="@container/preview grid">
            {items.map((item, index) => {
              const shape = RUN_SHAPE[runPosition(items, index, listOpenKey)];
              if (item.kind === 'removed') {
                return (
                  <RemovedPlaceholder
                    key="removed"
                    shape={shape}
                    removed={item.removed}
                    undoRef={undoButton}
                    onUndo={() => undoRemoval(item.removed)}
                  />
                );
              }
              if (item.row.key === listOpenKey) {
                return (
                  <li key={item.row.key} data-preview-card={item.row.key} className={openCardInList}>
                    <CardEditor
                      row={item.row}
                      number={item.number}
                      cardCount={rows.length}
                      onClose={() => toggle(item.row.key)}
                      onChange={(change) => updateRow(item.row.key, change)}
                      onRemove={() => remove(item.row)}
                    />
                  </li>
                );
              }
              return (
                <CardRow
                  key={item.row.key}
                  shape={shape}
                  row={item.row}
                  number={item.number}
                  selection={wide ? { selected: item.row.key === paneRow?.key, keysHintId } : undefined}
                  onOpen={() => openCard(item.row.key)}
                />
              );
            })}
          </ol>
          {paneRow && (
            <section
              key={paneRow.key}
              aria-label="Selected card"
              data-preview-card={paneRow.key}
              className={openCardInPane}
            >
              <CardEditor
                row={paneRow}
                number={rows.indexOf(paneRow) + 1}
                cardCount={rows.length}
                onChange={(change) => updateRow(paneRow.key, change)}
                onRemove={() => remove(paneRow)}
              />
            </section>
          )}
        </div>
        {wide && (
          <p id={keysHintId} hidden>
            {ROW_SELECTION_HINT}
          </p>
        )}
        {rows.length > 0 && (
          <PasteDock
            ref={dock}
            problem={
              destination.status === 'found' ? (
                <ImportProblem state={write.state} cardCount={rows.length} deckId={deckId} />
              ) : (
                <DestinationProblem destination={destination} />
              )
            }
          >
            <button
              type="button"
              onClick={confirmImport}
              disabled={destination.status !== 'found'}
              className={primaryButton}
            >
              {write.saving ? 'Importing…' : `Import ${cardCountLabel(rows.length)}`}
            </button>
          </PasteDock>
        )}
      </fieldset>
    </WorkspacePage>
  );
}

function firstKeyNeedingFix(rows: PreviewRow[]) {
  return rows.find(needsFix)?.key ?? null;
}

function rowInPane(rows: PreviewRow[], openKey: number | null) {
  return rows.find((row) => row.key === openKey) ?? rows.find(needsFix) ?? rows[0];
}

function cardToImport({ question, answer, explanation }: PreviewRow): CardToImport {
  return explanation?.trim() ? { question, answer, explanation } : { question, answer };
}

type ListItem = { kind: 'card'; row: PreviewRow; number: number } | { kind: 'removed'; removed: RemovedRow };
type RunPosition = 'alone' | 'first' | 'middle' | 'last';

const ROW_DIVIDER = 'before:absolute before:inset-x-1 before:top-0 before:h-px before:bg-line';

/** The shadow is clipped at the edges a row shares with its neighbors, so a run of closed rows reads as one surface. */
const RUN_SHAPE: Record<RunPosition, string> = {
  alone: 'rounded-card py-1',
  first: 'rounded-t-card pt-1 [clip-path:inset(-1rem_-1rem_0_-1rem)]',
  middle: `${ROW_DIVIDER} [clip-path:inset(0_-1rem)]`,
  last: `${ROW_DIVIDER} rounded-b-card pb-1 [clip-path:inset(0_-1rem_-1rem_-1rem)]`,
};

function listWithRemovedPlaceholder(rows: PreviewRow[], removed: RemovedRow | null): ListItem[] {
  const items: ListItem[] = rows.map((row, index) => ({ kind: 'card', row, number: index + 1 }));
  if (removed) items.splice(removed.index, 0, { kind: 'removed', removed });
  return items;
}

function runPosition(items: ListItem[], index: number, openKey: number | null): RunPosition {
  const isClosed = (item: ListItem | undefined) =>
    item !== undefined && (item.kind === 'removed' || item.row.key !== openKey);
  const joinsAbove = isClosed(items[index - 1]);
  const joinsBelow = isClosed(items[index + 1]);
  if (joinsAbove && joinsBelow) return 'middle';
  if (joinsAbove) return 'last';
  if (joinsBelow) return 'first';
  return 'alone';
}

const CLEARANCE = 8;

/**
 * The browser's focus scroll ignores the floating dock, which grows when it shows a problem, and lines a tall field up
 * by its bottom edge, so the field can end up under the dock or its label above the screen.
 */
function scrollClearOfDock(element: HTMLElement | null, dock: HTMLElement | null) {
  if (!element) return;
  const labelTop = (labelOf(element) ?? element).getBoundingClientRect().top - CLEARANCE;
  const visibleBottom = Math.min(dock?.getBoundingClientRect().top ?? window.innerHeight, window.innerHeight);
  const hiddenBelow = element.getBoundingClientRect().bottom + CLEARANCE - visibleBottom;
  if (labelTop < 0) scrollInstantly(labelTop);
  else if (hiddenBelow > 0) scrollInstantly(Math.min(hiddenBelow, labelTop));
}

function scrollInstantly(distance: number) {
  window.scrollTo({ top: window.scrollY + distance, behavior: 'instant' });
}

function labelOf(element: HTMLElement) {
  return element instanceof HTMLTextAreaElement ? element.labels?.[0] : undefined;
}

function previewCardPart(cardArea: HTMLElement | null, { part, key }: { part: 'header' | 'problem'; key: number }) {
  const control = part === 'problem' ? '[aria-invalid="true"]' : 'button:is([aria-expanded], [aria-pressed])';
  return cardArea?.querySelector<HTMLElement>(`[data-preview-card="${key}"] ${control}`) ?? null;
}

function PreviewSummary({ cardCount, destination }: Readonly<{ cardCount: number; destination: ImportDestination }>) {
  if (destination.status !== 'found') return cardCountLabel(cardCount);
  return (
    <>
      {cardCountLabel(cardCount)} for <span className="font-semibold text-ink">{destination.title}</span>
    </>
  );
}

function EditTextButton({ onClick, disabled }: Readonly<{ onClick: () => void; disabled: boolean }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pressable -mt-3 -ml-2 inline-flex min-h-12 items-center gap-1.5 rounded-control px-2 font-semibold text-accent active:text-accent-strong"
    >
      <ChevronLeft aria-hidden="true" className="size-[1em] shrink-0" />
      Edit text
    </button>
  );
}

type PreviewStatusProps = { cardsToFix: number; canImport: boolean; onShowCardToFix: () => void };

function PreviewStatus({ cardsToFix, canImport, onShowCardToFix }: Readonly<PreviewStatusProps>) {
  if (cardsToFix > 0) {
    return (
      <button
        type="button"
        onClick={onShowCardToFix}
        className="pressable -ml-1.5 inline-flex min-h-12 items-center rounded-control px-1.5 text-label"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-highlight-soft py-1 pr-3 pl-2 font-semibold text-highlight-strong">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {cardCountLabel(cardsToFix)} to fix
        </span>
      </button>
    );
  }
  if (!canImport) return null;
  return (
    <p className="inline-flex items-center gap-1.5 text-label font-semibold text-good">
      <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
      Ready to import
    </p>
  );
}

const dockMessage = 'rounded-card border border-line bg-surface px-4 py-3 text-support shadow-control';

function ImportProblem({
  state,
  cardCount,
  deckId,
}: Readonly<{ state: DeckWriteState; cardCount: number; deckId: string }>) {
  if (state.status !== 'failed') return null;
  if (state.reason === 'card-limit') {
    const availableCards = state.availableCards ?? 0;
    if (cardCount <= availableCards) return null;
    return <ImportProblemMessage>{cardLimitText(availableCards, cardCount)}</ImportProblemMessage>;
  }
  if (state.reason === 'create-conflict') {
    return (
      <ImportProblemMessage>
        Your earlier import was saved before these changes. Check the deck before importing again.
        <NavigationLink to={deckPath(deckId)} className="mt-1 -ml-2">
          Open the deck
        </NavigationLink>
      </ImportProblemMessage>
    );
  }
  if (state.reason === 'unknown') {
    return (
      <ImportProblemMessage>
        We couldn’t confirm the import. Check your connection, then import again. Trying again won’t add the cards
        twice.
      </ImportProblemMessage>
    );
  }
  return <DeckWriteProblem state={state} />;
}

function DestinationProblem({ destination }: Readonly<{ destination: UnconfirmedDestination }>) {
  if (destination.status === 'loading') {
    return <output className={`${dockMessage} block text-muted`}>Loading the deck…</output>;
  }
  if (destination.status === 'missing') {
    return (
      <ImportProblemMessage>
        This deck is no longer in your Library, so these cards can’t be imported. Choose Edit text to copy them.
      </ImportProblemMessage>
    );
  }
  return (
    <ImportProblemMessage>
      {destination.unavailable
        ? DECKS_UNAVAILABLE_TEXT
        : 'This deck couldn’t load, so you can’t import yet. Check your connection and try again.'}
      <button
        type="button"
        onClick={destination.onRetry}
        disabled={destination.retrying}
        className="pressable mt-1 -ml-2 inline-flex min-h-12 items-center rounded-control px-2 font-semibold text-accent active:text-accent-strong disabled:text-muted"
      >
        {destination.retrying ? 'Retrying…' : 'Try again'}
      </button>
    </ImportProblemMessage>
  );
}

function ImportProblemMessage({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div role="alert" className={`${dockMessage} flex items-start gap-2.5 text-ink`}>
      <CircleAlert aria-hidden="true" className="mt-[0.15em] size-[1.1em] shrink-0 text-highlight-strong" />
      <div className="grid min-w-0 justify-items-start">{children}</div>
    </div>
  );
}

function cardLimitText(availableCards: number, cardCount: number) {
  if (availableCards === 0) {
    return 'Your account has reached its card limit. Delete cards you no longer need, then import again.';
  }
  const extra = cardCount - availableCards;
  return `Your account has room for ${availableCards} more ${cardNoun(availableCards)}. Remove ${cardCountLabel(extra)} from this import, or delete cards you no longer need.`;
}

function firstProblem(problems: CardProblems, text: ProblemText) {
  if (problems.question) return text.question[problems.question];
  if (problems.answer) return text.answer[problems.answer];
  if (problems.explanation) return text.explanation[problems.explanation];
  return null;
}

function removedMediaText(media: RemovedMedia[]) {
  const image = media.includes('image');
  if (image && media.includes('audio')) return { chip: 'Had an image and audio', note: 'Image and audio removed.' };
  return image ? { chip: 'Had an image', note: 'Image removed.' } : { chip: 'Had audio', note: 'Audio removed.' };
}

type RowSelection = { selected: boolean; keysHintId: string };
type CardRowProps = { shape: string; row: PreviewRow; number: number; selection?: RowSelection; onOpen: () => void };

const rowForPane =
  'grid-cols-1 aria-pressed:bg-accent-soft aria-pressed:before:absolute aria-pressed:before:inset-y-3 aria-pressed:before:left-0 aria-pressed:before:w-[3px] aria-pressed:before:rounded-full aria-pressed:before:bg-accent';
const rowThatExpands = 'grid-cols-[minmax(0,1fr)_auto]';

function CardRow({ shape, row, number, selection, onOpen }: Readonly<CardRowProps>) {
  const numberId = useId();
  const questionId = useId();
  const summaryId = useId();
  const mediaId = useId();
  const problem = firstProblem(cardProblems(row), ROW_PROBLEM_TEXT);
  const nameParts = [numberId, questionId, summaryId, ...(row.removedMedia ? [mediaId] : [])];
  const selectsForPane = selection !== undefined;
  return (
    <li data-preview-card={row.key} className={`${closedRowSurface} ${shape}`}>
      <button
        type="button"
        data-card-row={selectsForPane || undefined}
        aria-expanded={selectsForPane ? undefined : false}
        aria-pressed={selection?.selected}
        tabIndex={selection && !selection.selected ? -1 : undefined}
        aria-describedby={selection?.selected ? selection.keysHintId : undefined}
        aria-labelledby={nameParts.join(' ')}
        onClick={onOpen}
        onKeyDown={selectsForPane ? moveRowSelection : undefined}
        className={`pressable my-1 grid min-h-12 w-full items-center gap-3 rounded-[calc(var(--radius-card)-0.25rem)] py-3 pr-2 pl-4 text-left @max-[16rem]/preview:grid-cols-1 @max-[16rem]/preview:pr-4 ${selectsForPane ? rowForPane : rowThatExpands}`}
      >
        <span className="min-w-0">
          <span id={numberId} className="sr-only">
            Card {number},
          </span>
          <span
            id={questionId}
            className={`line-clamp-2 text-label font-semibold whitespace-pre-line wrap-anywhere @max-[16rem]/preview:line-clamp-4 ${row.question.trim() ? '' : 'text-muted'}`}
          >
            {row.question.trim() || 'No question'}
          </span>
          <RowSummary id={summaryId} answer={row.answer} problem={problem} />
          {row.removedMedia && <RemovedMediaChip id={mediaId} media={row.removedMedia} />}
        </span>
        {!selectsForPane && (
          <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted @max-[16rem]/preview:hidden" />
        )}
      </button>
    </li>
  );
}

const closedRowSurface = 'relative grid min-w-0 bg-surface px-1 shadow-control';

function RemovedMediaIcon({ media }: Readonly<{ media: RemovedMedia[] }>) {
  const Icon = media.includes('image') ? ImageOff : VolumeX;
  return <Icon aria-hidden="true" className="mt-[0.15em] size-[1.1em] shrink-0" />;
}

function RemovedMediaChip({ id, media }: Readonly<{ id: string; media: RemovedMedia[] }>) {
  return (
    <span
      id={id}
      className="mt-1.5 flex w-fit max-w-full items-start gap-1 rounded-full bg-subtle py-0.5 pr-2.5 pl-1.5 text-[0.8125rem] font-semibold text-muted"
    >
      <RemovedMediaIcon media={media} />
      {removedMediaText(media).chip}
    </span>
  );
}

function RowSummary({ id, answer, problem }: Readonly<{ id: string; answer: string; problem: string | null }>) {
  if (problem) {
    return (
      <span
        id={id}
        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-highlight-soft py-0.5 pr-2.5 pl-1.5 text-[0.8125rem] font-bold text-highlight-strong"
      >
        <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
        {problem}
      </span>
    );
  }
  return (
    <span
      id={id}
      className="mt-0.5 line-clamp-2 text-support whitespace-pre-line text-muted wrap-anywhere @max-[16rem]/preview:line-clamp-4"
    >
      {answer}
    </span>
  );
}

const openCardInList =
  'my-3 grid min-w-0 rounded-card bg-surface px-4 pt-2 pb-3 shadow-card ring-2 ring-accent/30 first:mt-0 last:mb-0 @max-[16rem]/preview:px-3';
const openCardInPane =
  'sticky top-4 grid max-h-[calc(100dvh_-_8rem)] min-w-0 overflow-y-auto rounded-card bg-surface px-5 pt-2 pb-4 shadow-card';

type CardEditorProps = {
  row: PreviewRow;
  number: number;
  cardCount: number;
  /** Missing in the side pane, which always shows a card. */
  onClose?: () => void;
  onChange: (change: Partial<PastedCard>) => void;
  onRemove: () => void;
};

function CardEditor({ row, number, cardCount, onClose, onChange, onRemove }: Readonly<CardEditorProps>) {
  const fieldsId = useId();
  const problems = cardProblems(row);
  // Kept while the card is open, so the field stays put as text moves out of a long answer.
  const [explanationShown] = useState(() => row.explanation !== undefined || problems.answer === 'too-long');
  const position = `Card ${number} of ${cardCount}`;
  return (
    <>
      {onClose ? (
        <button
          type="button"
          aria-expanded={true}
          aria-controls={fieldsId}
          onClick={onClose}
          className="pressable -mx-2 flex min-h-12 items-center justify-between gap-3 rounded-control px-2 text-left text-support font-bold text-muted"
        >
          {position}
          <ChevronUp aria-hidden="true" className="size-5 shrink-0" />
        </button>
      ) : (
        <h2 className="flex min-h-12 items-center text-support font-bold text-muted">{position}</h2>
      )}
      <div id={fieldsId} className="grid gap-3.5">
        {row.removedMedia && (
          <p className="flex items-start gap-2 rounded-inset bg-subtle px-3 py-2.5 text-support text-ink">
            <RemovedMediaIcon media={row.removedMedia} />
            {removedMediaText(row.removedMedia).note} Check that the card still makes sense.
          </p>
        )}
        <TextField
          label="Question"
          growWithText
          rows={2}
          value={row.question}
          maxLength={CARD_FIELD_MAX_LENGTH.question}
          error={problems.question && FIELD_PROBLEM_TEXT.question[problems.question]}
          onChange={(question) => onChange({ question })}
        />
        <TextField
          label="Answer"
          growWithText
          rows={2}
          note="Keep it to one idea"
          nearLimitNote={explanationShown ? 'Move extra details to Explanation.' : undefined}
          value={row.answer}
          maxLength={CARD_FIELD_MAX_LENGTH.answer}
          error={problems.answer && FIELD_PROBLEM_TEXT.answer[problems.answer]}
          onChange={(answer) => onChange({ answer })}
        />
        {explanationShown && (
          <TextField
            label="Explanation"
            note="Optional"
            growWithText
            rows={3}
            optional
            value={row.explanation ?? ''}
            maxLength={CARD_FIELD_MAX_LENGTH.explanation}
            error={problems.explanation && FIELD_PROBLEM_TEXT.explanation[problems.explanation]}
            onChange={(explanation) => onChange({ explanation })}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="pressable -ml-2 inline-flex min-h-12 items-center gap-1.5 rounded-control px-2 text-label font-semibold text-missed"
          >
            <Trash2 aria-hidden="true" className="size-[1.125em] shrink-0" />
            Remove card
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="pressable inline-flex min-h-12 items-center rounded-control bg-accent-soft px-6 text-body font-semibold text-accent-strong"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </>
  );
}

type RemovedPlaceholderProps = {
  shape: string;
  removed: RemovedRow;
  undoRef: Ref<HTMLButtonElement>;
  onUndo: () => void;
};

function RemovedPlaceholder({ shape, removed, undoRef, onUndo }: Readonly<RemovedPlaceholderProps>) {
  const question = removed.row.question.trim() || 'Card without a question';
  return (
    <li className={`${closedRowSurface} ${shape}`}>
      <span className="flex min-w-0 items-center justify-between gap-3 py-1 pr-0 pl-4 text-support text-muted">
        <span className="line-clamp-2 min-w-0 flex-1 wrap-anywhere">
          Removed <span className="font-semibold text-ink">“{question}”</span>
        </span>
        <button
          ref={undoRef}
          type="button"
          onClick={onUndo}
          className="pressable inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-control px-3 font-semibold text-accent"
        >
          <Undo2 aria-hidden="true" className="size-[1.125em] shrink-0" />
          Undo
        </button>
      </span>
    </li>
  );
}
