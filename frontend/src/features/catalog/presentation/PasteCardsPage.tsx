import { ChevronRight } from 'lucide-react';
import { useContext, useEffect, useId, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { noConvertedFields, type ConvertedFields } from '../application/ankiFields';
import type { Deck } from '../application/decks';
import {
  MAX_CARDS_PER_IMPORT,
  formatPastedCards,
  parsePastedCards,
  withRemovedMediaFrom,
  type PastedCard,
} from '../application/pastedCards';
import { useDeckGateway } from './DeckProvider';
import type { LibraryBrowsing } from './LibraryBrowsingLayout';
import { PasteDock } from './PasteDock';
import { PastePreview, type ImportDestination } from './PastePreview';
import { decksUnavailable } from './decksUnavailable';
import { textFieldStyle } from './TextField';
import { useUnsavedDeckForm } from './UnsavedDeckChanges';
import { useDecks } from './useDecks';
import { LIBRARY_PATH, deckPath } from '../../../shared/navigation/paths';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { useFirstInput } from '../../../shared/ui/useFirstInput';

const PASTE_EXAMPLE =
  'What is an archipelago?\nA group of islands.\n\nWhat is a strait?\nA narrow channel between two seas.';

/** A new account or deck starts a new page, so one learner's paste never reaches another account or deck. */
export function PasteCardsPage() {
  const { username } = useOutletContext<LibraryBrowsing>();
  const { deckId = '' } = useParams();
  return <PasteCards key={`${username}:${deckId}`} username={username} deckId={deckId} />;
}

function PasteCards({ username, deckId }: Readonly<{ username: string; deckId: string }>) {
  const decks = useDecks(username, true);
  const deck = decks.data?.find((item) => item.id === deckId);
  const [requestId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState('');
  const [writtenCards, setWrittenCards] = useState<PastedCard[]>([]);
  const [converted] = useState(noConvertedFields);
  const [previewCards, setPreviewCards] = useState<PastedCard[] | null>(null);
  const hasText = text.trim() !== '';
  const draft = useUnsavedDeckForm(hasText);
  const previewing = previewCards !== null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [previewing]);

  if (decks.isSuccess && !deck && !hasText) return <MissingDeck />;
  if (previewCards === null) {
    return (
      <PasteStep
        deckId={deckId}
        deckTitle={deck?.title}
        text={text}
        writtenCards={writtenCards}
        converted={converted}
        onTextChange={setText}
        onPreview={setPreviewCards}
      />
    );
  }
  return (
    <PastePreview
      username={username}
      deckId={deckId}
      destination={importDestination(decks, deck)}
      requestId={requestId}
      cards={previewCards}
      onEditText={(editedCards) => {
        if (editedCards) {
          setText(formatPastedCards(editedCards));
          setWrittenCards(editedCards);
        }
        setPreviewCards(null);
      }}
      onImported={draft.saved}
    />
  );
}

function importDestination(decks: ReturnType<typeof useDecks>, deck: Deck | undefined): ImportDestination {
  if (deck) return { status: 'found', title: deck.title };
  if (decks.isPending) return { status: 'loading' };
  if (decks.isSuccess) return { status: 'missing' };
  return {
    status: 'failed',
    unavailable: decksUnavailable(decks.error),
    retrying: decks.isFetching,
    onRetry: () => void decks.refetch(),
  };
}

function MissingDeck() {
  return (
    <WorkspacePage title="Paste cards">
      <p role="alert" className="mb-4 text-muted">
        This deck isn’t in your Library.
      </p>
      <NavigationLink to={LIBRARY_PATH} back>
        Back to Library
      </NavigationLink>
    </WorkspacePage>
  );
}

type PasteStepProps = {
  deckId: string;
  deckTitle: string | undefined;
  text: string;
  writtenCards: PastedCard[];
  converted: ConvertedFields;
  onTextChange: (text: string) => void;
  onPreview: (cards: PastedCard[]) => void;
};

function PasteStep({
  deckId,
  deckTitle,
  text,
  writtenCards,
  converted,
  onTextChange,
  onPreview,
}: Readonly<PasteStepProps>) {
  const gateway = useDeckGateway();
  const firstInput = useFirstInput(gateway.prepareWrite);
  const requestFocus = useContext(FocusRequestContext);
  const cards = useMemo(
    () => withRemovedMediaFrom(writtenCards, parsePastedCards(text, converted)),
    [writtenCards, text, converted],
  );
  const [triedEmpty, setTriedEmpty] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const helpId = useId();
  const countId = useId();
  const tooMany = cards.length > MAX_CARDS_PER_IMPORT;
  const problem = pasteProblem(cards.length, triedEmpty);

  function preview(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cards.length === 0) {
      setTriedEmpty(true);
      requestFocus(field.current);
      return;
    }
    if (tooMany) {
      requestFocus(field.current);
      return;
    }
    onPreview(cards);
  }

  return (
    <WorkspacePage
      title="Paste cards"
      aboveTitle={
        <NavigationLink to={deckPath(deckId)} back className="-mt-3 -ml-2">
          {deckTitle ?? 'Deck'}
        </NavigationLink>
      }
      subtitle={`Up to ${MAX_CARDS_PER_IMPORT} cards at once`}
    >
      <form onSubmit={preview} onInput={firstInput} noValidate className="grid max-w-2xl gap-4">
        <div className="rounded-card bg-surface p-compact-gutter py-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <label htmlFor={fieldId} className="text-label font-semibold">
              Your text
            </label>
            <span
              id={countId}
              className={`text-label font-bold tabular-nums ${tooMany ? 'text-missed' : 'text-accent-strong'}`}
            >
              {cards.length > 0 && `${cardCountLabel(cards.length)} found`}
            </span>
          </div>
          <textarea
            ref={field}
            id={fieldId}
            rows={6}
            value={text}
            placeholder={PASTE_EXAMPLE}
            aria-describedby={`${helpId} ${countId}`}
            aria-invalid={problem ? true : undefined}
            onChange={(event) => {
              setTriedEmpty(false);
              onTextChange(event.target.value);
            }}
            className={`${textFieldStyle} min-h-40 resize-y sm:min-h-72 ${problem ? 'border-missed' : ''}`}
          />
          <p id={helpId} className="mt-2.5 text-support text-muted">
            Question on the first line, answer below, blank line between cards. Q:&nbsp;and&nbsp;A: labels work too, as
            do rows from a spreadsheet, Quizlet or Anki.
          </p>
          {problem && (
            <p role="alert" className="mt-3 rounded-inset bg-highlight-soft p-3 text-support text-ink">
              {problem}
            </p>
          )}
        </div>
        <PasteDock>
          <button type="submit" className={primaryButton}>
            {cards.length > 0 && !tooMany ? `Preview ${cardCountLabel(cards.length)}` : 'Preview cards'}
            <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
          </button>
        </PasteDock>
      </form>
    </WorkspacePage>
  );
}

function pasteProblem(cardCount: number, triedEmpty: boolean): string | null {
  if (cardCount > MAX_CARDS_PER_IMPORT) {
    return `This text has ${cardCount} cards. Paste up to ${MAX_CARDS_PER_IMPORT} at a time, then paste the rest after importing.`;
  }
  if (cardCount === 0 && triedEmpty) return 'Paste at least one question with its answer.';
  return null;
}
