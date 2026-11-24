import {
  ArrowRight,
  ChevronLeft,
  CircleCheck,
  CirclePause,
  Clock,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';
import { Link } from 'react-router';
import type { Deck, DeckProgress } from '../application/decks';
import { DeckSearch } from './DeckSearch';
import { LIBRARY_PATH, reviewTopicPath } from '../../../shared/navigation/paths';
import { DAILY_NEW_CARD_LIMIT, REVIEW_TIME_ZONE, REVIEW_TIME_ZONE_OFFSET } from '../../../shared/product/studyRules';
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
  if (progress.newCards > 0 && progress.newCardsLeftToday !== 0) return 'start';
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
  if (progress.newCards > 0 && progress.newCardsLeftToday !== undefined) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {cardCountLabel(deck.cardCount)} <NewCardsToday left={progress.newCardsLeftToday} />
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

function NewCardsToday({ left }: Readonly<{ left: number }>) {
  const Icon = left > 0 ? Sparkles : Clock;
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-control py-0.5 pr-2.5 pl-2 font-semibold ${left > 0 ? 'bg-accent-soft text-accent-strong' : 'bg-subtle text-muted'}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {left > 0 ? `${left} of ${DAILY_NEW_CARD_LIMIT} new left today` : 'New cards tomorrow'}
    </span>
  );
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
  stickyBottom: number | null;
  onHeldBottomChange: (bottom: number | null) => void;
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
    stickyBottom,
    onHeldBottomChange,
  } = props;
  const [searching, setSearching] = useState(false);
  const titleMarker = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const showBackBar = useHeldAtStickyTop(titleMarker, bar, stickyBottom);
  useReportedHeldBottom(bar, onHeldBottomChange);
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
    <>
      <div ref={titleMarker} />
      <div
        ref={bar}
        data-stuck={showBackBar || undefined}
        className={`z-10 -mx-1 mb-1 flex flex-wrap items-center gap-2 bg-page px-1 py-2 @min-[20rem]/workspace:top-14 data-stuck:shadow-[0_1px_0_var(--color-line)] ${stickyBottom !== null ? 'sticky' : ''}`}
      >
        {showBackBar && <DeckBackBar deck={deck} />}
        {tools}
      </div>
    </>
  );
}

function useHeldAtStickyTop(
  marker: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
  stickyBottom: number | null,
) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const target = marker.current;
    const element = bar.current;
    if (!target || !element || stickyBottom === null) return;
    const offset = stickyTop(element);
    const watcher = new IntersectionObserver(
      ([entry]) => setHeld(!entry.isIntersecting && entry.boundingClientRect.top < offset),
      { rootMargin: `${-offset}px 0px 0px 0px` },
    );
    watcher.observe(target);
    return () => watcher.disconnect();
  }, [marker, bar, stickyBottom]);
  return stickyBottom !== null && held;
}

function useReportedHeldBottom(bar: RefObject<HTMLElement | null>, report: (bottom: number | null) => void) {
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return;
    const viewport = window.visualViewport ?? window;
    const measure = () => {
      const top = stickyTop(element);
      const bottom = top + element.offsetHeight;
      const height = window.visualViewport?.height ?? window.innerHeight;
      const leavesRoomForCards = bottom <= height / 2;
      report(top > 0 && leavesRoomForCards ? bottom : null);
    };
    measure();
    const sizeChanges = new ResizeObserver(measure);
    sizeChanges.observe(element);
    viewport.addEventListener('resize', measure);
    return () => {
      viewport.removeEventListener('resize', measure);
      sizeChanges.disconnect();
      report(null);
    };
  }, [bar, report]);
}

function stickyTop(element: HTMLElement) {
  return Number.parseFloat(getComputedStyle(element).top) || 0;
}

function DeckBackBar({ deck }: Readonly<{ deck: Deck }>) {
  return (
    <div className="absolute inset-x-0 bottom-full hidden h-14 items-center gap-1 bg-page px-1 @min-[20rem]/workspace:flex">
      <Link
        to={LIBRARY_PATH}
        aria-label="Back to Library"
        className="pressable -ml-1 grid size-12 shrink-0 place-items-center rounded-control text-accent"
      >
        <ChevronLeft aria-hidden="true" className="size-6" />
      </Link>
      <div aria-hidden="true" className="min-w-0 leading-tight">
        <p className="truncate text-label font-extrabold tracking-tight">{deck.title}</p>
        <p className="text-support text-muted">{cardCountLabel(deck.cardCount)}</p>
      </div>
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
