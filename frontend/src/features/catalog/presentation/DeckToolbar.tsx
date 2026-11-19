import { ArrowRight, CircleCheck, CirclePause, Play, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useState, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router';
import type { Deck, DeckProgress } from '../application/decks';
import { DeckSearch } from './DeckSearch';
import { reviewTopicPath } from '../../../shared/navigation/paths';
import { REVIEW_TIME_ZONE, REVIEW_TIME_ZONE_OFFSET } from '../../../shared/product/studyRules';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { cardCountLabel } from '../../../shared/ui/cardCount';

const reviewDay = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: REVIEW_TIME_ZONE,
});

const iconButton =
  'pressable grid size-12 shrink-0 place-items-center rounded-control bg-surface text-accent shadow-control aria-expanded:bg-accent-soft';

type StudyKind = 'resume' | 'review' | 'start' | 'add';

function studyKind(deck: Deck, progress: DeckProgress): StudyKind {
  if (deck.archived) return 'resume';
  if (progress.dueCards > 0) return 'review';
  if (progress.newCards > 0) return 'start';
  return 'add';
}

export function DeckStatus({ deck, progress }: Readonly<{ deck: Deck; progress: DeckProgress }>) {
  if (deck.archived) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle py-0.5 pr-2.5 pl-1.5 font-semibold">
          <CirclePause aria-hidden="true" className="size-4 shrink-0" />
          Paused
        </span>
        {cardCountLabel(deck.cardCount)}
      </span>
    );
  }
  if (studyKind(deck, progress) === 'add' && progress.nextReviewDate) {
    const next = reviewDay.format(new Date(`${progress.nextReviewDate}T00:00:00${REVIEW_TIME_ZONE_OFFSET}`));
    return (
      <span className="flex flex-wrap items-center gap-x-1.5">
        {cardCountLabel(deck.cardCount)} ·
        <span className="inline-flex items-center gap-1 text-good">
          <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
          Caught up until {next}
        </span>
      </span>
    );
  }
  return cardCountLabel(deck.cardCount);
}

type DeckToolbarProps = {
  wide: boolean;
  deck: Deck;
  progress: DeckProgress;
  term: string;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  addButton: Ref<HTMLButtonElement>;
  startLink: Ref<HTMLAnchorElement>;
  resuming: boolean;
  onAdd: () => void;
  onResume: () => void;
  settings: { id: string; open: boolean; onToggle: () => void };
  settingsButton: Ref<HTMLButtonElement>;
  pagination: ReactNode;
};

export function DeckToolbar(props: Readonly<DeckToolbarProps>) {
  const {
    wide,
    deck,
    progress,
    term,
    onSearch,
    onClearSearch,
    settings,
    settingsButton: settingsRef,
    pagination,
  } = props;
  const [searching, setSearching] = useState(false);
  const addIsStudyAction = studyKind(deck, progress) === 'add';
  const settingsButton = (
    <button
      ref={settingsRef}
      type="button"
      aria-label="Deck settings"
      title="Deck settings"
      aria-expanded={settings.open}
      aria-controls={settings.id}
      onClick={settings.onToggle}
      className={iconButton}
    >
      <SlidersHorizontal aria-hidden="true" className="size-5" />
    </button>
  );
  const search = (focusOnMount: boolean) => (
    <DeckSearch term={term} onSearch={onSearch} onClear={onClearSearch} focusOnMount={focusOnMount} />
  );

  let tools: ReactNode;
  if (wide) {
    tools = (
      <>
        {search(false)}
        {!addIsStudyAction && <AddCardButton {...props} labeled />}
        {settingsButton}
        <StudyAction {...props} />
        {pagination}
      </>
    );
  } else if (searching || term) {
    tools = (
      <>
        {search(searching)}
        <button
          type="button"
          onClick={() => {
            setSearching(false);
            onClearSearch();
          }}
          className="pressable min-h-12 shrink-0 rounded-control px-2 text-label font-semibold text-accent"
        >
          Cancel
        </button>
      </>
    );
  } else {
    tools = (
      <>
        <StudyAction {...props} />
        {!addIsStudyAction && <AddCardButton {...props} labeled={false} />}
        <button type="button" aria-label="Search cards" onClick={() => setSearching(true)} className={iconButton}>
          <Search aria-hidden="true" className="size-5" />
        </button>
        {settingsButton}
      </>
    );
  }
  return (
    <div className="top-0 z-10 -mx-1 mb-1 flex flex-wrap items-center gap-2 bg-page px-1 py-2 @min-[20rem]/workspace:sticky">
      {tools}
    </div>
  );
}

function AddCardButton({
  addButton,
  onAdd,
  labeled,
}: Readonly<Pick<DeckToolbarProps, 'addButton' | 'onAdd'> & { labeled: boolean }>) {
  if (!labeled) {
    return (
      <button ref={addButton} type="button" aria-label="Add card" onClick={onAdd} className={iconButton}>
        <Plus aria-hidden="true" className="size-5" />
      </button>
    );
  }
  return (
    <button ref={addButton} type="button" onClick={onAdd} className={`${secondaryButton} shrink-0`}>
      <Plus aria-hidden="true" className="size-5 shrink-0" />
      Add card
    </button>
  );
}

function StudyAction({
  wide,
  deck,
  progress,
  addButton,
  startLink,
  resuming,
  onAdd,
  onResume,
}: Readonly<DeckToolbarProps>) {
  const fill = wide ? 'shrink-0' : 'min-w-fit flex-1';
  const kind = studyKind(deck, progress);
  if (kind === 'resume') {
    return (
      <button
        type="button"
        aria-label={resuming ? undefined : 'Resume reviews'}
        disabled={resuming}
        className={`${primaryButton} ${fill}`}
        onClick={onResume}
      >
        <Play aria-hidden="true" className="size-5 shrink-0" />
        {resuming ? 'Resuming…' : 'Resume'}
      </button>
    );
  }
  if (kind === 'review') {
    return (
      <Link ref={startLink} to={reviewTopicPath(`deck-${deck.id}`)} className={`${primaryButton} ${fill}`}>
        Review {progress.dueCards} due
        {wide && <ArrowRight aria-hidden="true" className="size-5 shrink-0" />}
      </Link>
    );
  }
  if (kind === 'start') {
    return (
      <Link
        ref={startLink}
        to={reviewTopicPath(`deck-${deck.id}`, true)}
        aria-label="Start review"
        className={`${primaryButton} ${fill}`}
      >
        Start
        {wide && <ArrowRight aria-hidden="true" className="size-5 shrink-0" />}
      </Link>
    );
  }
  return (
    <button ref={addButton} type="button" onClick={onAdd} className={`${primaryButton} ${fill}`}>
      <Plus aria-hidden="true" className="size-5 shrink-0" />
      Add card
    </button>
  );
}

/** The study action already shows the due count, so the filter labels leave it out. */
export function DueFilter({ dueOnly, onChange }: Readonly<{ dueOnly: boolean; onChange: (dueOnly: boolean) => void }>) {
  const option = (label: ReactNode, value: boolean) => (
    <button
      type="button"
      aria-pressed={dueOnly === value}
      onClick={() => onChange(value)}
      className="pressable flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-inset px-3 text-support font-bold text-muted aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-control"
    >
      {label}
    </button>
  );
  return (
    <fieldset className="mb-3 flex w-full max-w-64 min-w-0 gap-1 rounded-control bg-subtle p-1">
      <legend className="sr-only">Show cards</legend>
      {option('All', false)}
      {option(
        <>
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-highlight" /> Due
        </>,
        true,
      )}
    </fieldset>
  );
}
