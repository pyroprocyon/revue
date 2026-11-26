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
import { useDeckGateway } from './DeckProvider';
import { DeckWriteProblem } from './DeckWriteProblem';
import { TextField } from './TextField';
import { DECKS_UNAVAILABLE_TEXT } from './decksUnavailable';
import { useDeckWrite, type DeckWriteState } from './useDecks';
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
  const list = useRef<HTMLOListElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const importBar = useRef<HTMLDivElement>(null);
  const cardsToFix = rows.filter(needsFix).length;

  useEffect(() => {
    if (focusTarget === null) return;
    const target = focusTarget.part === 'undo' ? undoButton.current : previewCardPart(list.current, focusTarget);
    requestFocus(target);
    scrollBelowBar(labelOf(target) ?? target, importBar.current);
  }, [focusTarget, requestFocus]);

  function updateRow(key: number, change: Partial<PastedCard>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setEdited(true);
  }

  function toggle(key: number) {
    setOpenKey(openKey === key ? null : key);
    setFocusTarget({ part: 'header', key });
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
    >
      <fieldset disabled={write.saving} aria-busy={write.saving} className="grid max-w-2xl min-w-0 gap-3">
        <output className="sr-only">{announcement}</output>
        {rows.length > 0 ? (
          <ImportBar
            barRef={importBar}
            cardCount={rows.length}
            cardsToFix={cardsToFix}
            saving={write.saving}
            canImport={destination.status === 'found'}
            problem={
              destination.status === 'found' ? (
                <ImportProblem state={write.state} cardCount={rows.length} deckId={deckId} />
              ) : (
                <DestinationProblem destination={destination} />
              )
            }
            onShowCardToFix={showFirstCardToFix}
            onImport={confirmImport}
          />
        ) : (
          <p className="text-body text-muted">No cards left to import. Undo a removal or edit your text.</p>
        )}
        <ol ref={list} aria-label="Cards to import" className="@container/preview grid">
          {items.map((item, index) => {
            const shape = RUN_SHAPE[runPosition(items, index, openKey)];
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
            if (item.row.key === openKey) {
              return (
                <CardEditor
                  key={item.row.key}
                  row={item.row}
                  number={item.number}
                  cardCount={rows.length}
                  onClose={() => toggle(item.row.key)}
                  onChange={(change) => updateRow(item.row.key, change)}
                  onRemove={() => remove(item.row)}
                />
              );
            }
            return (
              <CardRow
                key={item.row.key}
                shape={shape}
                row={item.row}
                number={item.number}
                onOpen={() => toggle(item.row.key)}
              />
            );
          })}
        </ol>
      </fieldset>
    </WorkspacePage>
  );
}

function firstKeyNeedingFix(rows: PreviewRow[]) {
  return rows.find(needsFix)?.key ?? null;
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

const GAP_BELOW_BAR = 8;

/**
 * The browser's focus scroll ignores the sticky import bar, which grows when it shows a problem, and lines a tall field
 * up by its bottom edge, so the field's label can end up hidden.
 */
function scrollBelowBar(element: Element | null | undefined, bar: HTMLElement | null) {
  if (!element) return;
  const barBottom = bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().bottom : 0;
  const hidden = barBottom + GAP_BELOW_BAR - element.getBoundingClientRect().top;
  if (hidden > 0) window.scrollTo({ top: window.scrollY - hidden, behavior: 'instant' });
}

function labelOf(element: HTMLElement | null) {
  return element instanceof HTMLTextAreaElement ? element.labels?.[0] : undefined;
}

function previewCardPart(list: HTMLElement | null, target: { part: 'header' | 'problem'; key: number }) {
  const card = list?.querySelector(`[data-preview-card="${target.key}"]`);
  const selector = target.part === 'problem' ? '[aria-invalid="true"]' : 'button[aria-expanded]';
  return card?.querySelector<HTMLElement>(selector) ?? null;
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

type ImportBarProps = {
  barRef: Ref<HTMLDivElement>;
  cardCount: number;
  cardsToFix: number;
  saving: boolean;
  canImport: boolean;
  problem: ReactNode;
  onShowCardToFix: () => void;
  onImport: () => void;
};

const fadeBelow =
  'after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-linear-to-b after:from-page after:to-transparent';

function ImportBar({
  barRef,
  cardCount,
  cardsToFix,
  saving,
  canImport,
  problem,
  onShowCardToFix,
  onImport,
}: Readonly<ImportBarProps>) {
  return (
    <div
      ref={barRef}
      className={`relative top-0 z-10 -mx-1 grid gap-2 bg-page px-1 py-2 @min-[20rem]/workspace:sticky ${fadeBelow}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {cardsToFix > 0 && (
          <button
            type="button"
            onClick={onShowCardToFix}
            className="pressable -ml-1.5 inline-flex min-h-12 items-center rounded-control px-1.5 text-label"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-highlight-soft py-1 pr-3 pl-2 font-semibold text-highlight-strong">
              <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
              {cardsToFix} to fix
            </span>
          </button>
        )}
        {cardsToFix === 0 && canImport && (
          <p className="inline-flex min-h-12 items-center gap-1.5 text-label font-semibold text-good">
            <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
            Ready
          </p>
        )}
        <button
          type="button"
          onClick={onImport}
          disabled={!canImport}
          className={`${primaryButton} ml-auto max-w-full`}
        >
          {saving ? 'Importing…' : `Import ${cardCountLabel(cardCount)}`}
        </button>
      </div>
      {problem}
    </div>
  );
}

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
    return <output className="block text-support text-muted">Loading the deck…</output>;
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
    <div role="alert" className="grid justify-items-start rounded-inset bg-highlight-soft p-4 text-support text-ink">
      {children}
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

type CardRowProps = { shape: string; row: PreviewRow; number: number; onOpen: () => void };

function CardRow({ shape, row, number, onOpen }: Readonly<CardRowProps>) {
  const numberId = useId();
  const questionId = useId();
  const summaryId = useId();
  const mediaId = useId();
  const problem = firstProblem(cardProblems(row), ROW_PROBLEM_TEXT);
  const nameParts = [numberId, questionId, summaryId, ...(row.removedMedia ? [mediaId] : [])];
  return (
    <li data-preview-card={row.key} className={`${closedRowSurface} ${shape}`}>
      <button
        type="button"
        aria-expanded={false}
        aria-labelledby={nameParts.join(' ')}
        onClick={onOpen}
        className="pressable my-1 grid min-h-12 w-full scroll-mt-32 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[calc(var(--radius-card)-0.25rem)] py-3 pr-2 pl-4 text-left @max-[16rem]/preview:grid-cols-1 @max-[16rem]/preview:pr-4"
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
        <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted @max-[16rem]/preview:hidden" />
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

type CardEditorProps = {
  row: PreviewRow;
  number: number;
  cardCount: number;
  onClose: () => void;
  onChange: (change: Partial<PastedCard>) => void;
  onRemove: () => void;
};

function CardEditor({ row, number, cardCount, onClose, onChange, onRemove }: Readonly<CardEditorProps>) {
  const fieldsId = useId();
  const problems = cardProblems(row);
  // Kept while the card is open, so the field stays put as text moves out of a long answer.
  const [explanationShown] = useState(() => row.explanation !== undefined || problems.answer === 'too-long');
  return (
    <li
      data-preview-card={row.key}
      className="my-3 grid min-w-0 rounded-card bg-surface px-4 pt-2 pb-3 shadow-card ring-2 ring-accent/30 first:mt-0 last:mb-0 @max-[16rem]/preview:px-3"
    >
      <button
        type="button"
        aria-expanded={true}
        aria-controls={fieldsId}
        onClick={onClose}
        className="pressable -mx-2 flex min-h-12 scroll-mt-32 items-center justify-between gap-3 rounded-control px-2 text-left text-support font-bold text-muted"
      >
        Card {number} of {cardCount}
        <ChevronUp aria-hidden="true" className="size-5 shrink-0" />
      </button>
      <div id={fieldsId} className="grid gap-3.5 [&_textarea]:scroll-mt-32">
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
          <button
            type="button"
            onClick={onClose}
            className="pressable inline-flex min-h-12 items-center rounded-control bg-accent-soft px-6 text-body font-semibold text-accent-strong"
          >
            Done
          </button>
        </div>
      </div>
    </li>
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
