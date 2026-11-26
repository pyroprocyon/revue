import {
  ArrowRight,
  ChevronLeft,
  CirclePause,
  Clock,
  PartyPopper,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';
import { Link } from 'react-router';
import type { Deck, DeckProgress } from '../application/decks';
import { DeckSearch } from './DeckSearch';
import { LIBRARY_PATH, reviewTopicPath } from '../../../shared/navigation/paths';
import { REVIEW_TIME_ZONE, REVIEW_TIME_ZONE_OFFSET } from '../../../shared/product/studyRules';
import { blueAccentButton, primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { FlashcardsIcon } from '../../../shared/ui/FlashcardsIcon';

const reviewDay = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: REVIEW_TIME_ZONE,
});

export const cardToolButton =
  'pressable neutral-control-gradient grid size-12 shrink-0 place-items-center rounded-control bg-surface text-accent shadow-control aria-expanded:bg-accent-soft aria-expanded:[background-image:var(--tonal-control-gradient)]';

const deckStatusPill = 'inline-flex min-w-0 items-center gap-1.5 rounded-control py-0.5 pr-2.5 pl-2 font-semibold';

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
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {cardCountLabel(deck.cardCount)}
        <span className={`${deckStatusPill} bg-success-soft text-success`}>
          <PartyPopper aria-hidden="true" className="size-4 shrink-0" />
          Next review {next}
        </span>
      </span>
    );
  }
  return cardCountLabel(deck.cardCount);
}

function NewCardsToday({ left }: Readonly<{ left: number }>) {
  const Icon = left > 0 ? FlashcardsIcon : Clock;
  const unit = left === 1 ? 'card' : 'cards';
  return (
    <span className={`${deckStatusPill} ${left > 0 ? 'bg-accent-soft text-accent-strong' : 'bg-subtle text-muted'}`}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {left > 0 ? `${left} new ${unit} left today` : 'New cards tomorrow'}
    </span>
  );
}

type DeckToolbarProps = {
  wide: boolean;
  deck: Deck;
  progress?: DeckProgress;
  term: string;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  addButton?: Ref<HTMLButtonElement>;
  startLink?: Ref<HTMLAnchorElement>;
  resuming?: boolean;
  onAdd?: () => void;
  onResume?: () => void;
  settings?: { id: string; open: boolean; onToggle: () => void; label?: string };
  collectionAction?: ReactNode;
  filter?: ReactNode;
  settingsButton?: Ref<HTMLButtonElement>;
  savedSetBack?: string;
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
    savedSetBack,
    collectionAction,
    stickyBottom,
    onHeldBottomChange,
  } = props;
  const [searching, setSearching] = useState(false);
  const titleMarker = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const showBackBar = useHeldAtStickyTop(titleMarker, bar, stickyBottom);
  useReportedHeldBottom(bar, onHeldBottomChange);
  const addIsStudyAction = progress && studyKind(deck, progress) === 'add';
  const settingsButton = settings && (
    <button
      ref={settingsRef}
      type="button"
      aria-label={settings.label ?? 'Deck settings'}
      title={settings.label ?? 'Deck settings'}
      aria-expanded={settings.open}
      aria-controls={settings.id}
      onClick={settings.onToggle}
      className={cardToolButton}
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
        {props.onAdd && !addIsStudyAction && <AddCardButton {...props} labeled />}
        {collectionAction}
        {settingsButton}
        <StudyAction {...props} />
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
        {props.onAdd && !addIsStudyAction && <AddCardButton {...props} labeled={false} />}
        {collectionAction}
        <button type="button" aria-label="Search cards" onClick={() => setSearching(true)} className={cardToolButton}>
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
        className={`deck-toolbar z-10 -mx-1 mb-1 flex flex-wrap items-center gap-2 bg-page px-1 py-2 data-stuck:shadow-[0_1px_0_var(--color-line)] ${stickyBottom !== null ? 'sticky' : ''}`}
      >
        {showBackBar && <DeckBackBar deck={deck} backTo={savedSetBack ?? LIBRARY_PATH} />}
        {tools}
        {props.filter && <div className="mb-3 min-w-0 basis-full">{props.filter}</div>}
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
    const watcher = new IntersectionObserver(() => setHeld(target.getBoundingClientRect().top < offset), {
      rootMargin: `${-offset}px 0px 0px 0px`,
    });
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

function DeckBackBar({ deck, backTo }: Readonly<{ deck: Deck; backTo: string }>) {
  return (
    <div className="absolute inset-x-0 bottom-full hidden h-14 items-center gap-1 bg-page px-1 @min-[20rem]/workspace:flex">
      <Link
        to={backTo}
        aria-label="Back to Library"
        className="pressable header-link -ml-1 w-12 shrink-0 justify-center"
      >
        <ChevronLeft aria-hidden="true" />
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
      <button ref={addButton} type="button" aria-label="Add card" onClick={onAdd} className={cardToolButton}>
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
  savedSetBack,
}: Readonly<DeckToolbarProps>) {
  if (!progress) return null;
  const fill = wide ? 'shrink-0' : 'min-w-fit flex-1';
  const kind = studyKind(deck, progress);
  const topic = `${savedSetBack ? 'set' : 'deck'}-${deck.id}`;
  const reviewButton = savedSetBack ? blueAccentButton : primaryButton;
  if (kind === 'resume') {
    return (
      <button
        type="button"
        aria-label={resuming ? undefined : 'Resume reviews'}
        disabled={resuming}
        className={`${reviewButton} ${fill}`}
        onClick={onResume}
      >
        <Play aria-hidden="true" className="size-5 shrink-0" />
        {resuming ? 'Resuming…' : 'Resume'}
      </button>
    );
  }
  if (kind === 'review' || kind === 'start') {
    const action = kind === 'review' ? `Review ${progress.dueCards} due` : 'Start';
    return (
      <Link
        ref={startLink}
        to={reviewTopicPath(topic, kind === 'start')}
        aria-label={startReviewLabel(kind, deck.title, Boolean(savedSetBack))}
        className={`${reviewButton} ${fill}`}
      >
        {action}
        {wide && <ArrowRight aria-hidden="true" className="size-5 shrink-0" />}
      </Link>
    );
  }
  if (!onAdd) return null;
  return (
    <button ref={addButton} type="button" onClick={onAdd} className={`${primaryButton} ${fill}`}>
      <Plus aria-hidden="true" className="size-5 shrink-0" />
      Add card
    </button>
  );
}

function startReviewLabel(kind: 'review' | 'start', title: string, saved: boolean) {
  if (kind === 'start') return saved ? `Start review: ${title}` : 'Start review';
  return undefined;
}
