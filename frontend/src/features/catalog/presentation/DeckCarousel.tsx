import { ChevronRight, CirclePause, Layers2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from 'react';
import { Link } from 'react-router';
import { deckPath } from '../../../shared/navigation/paths';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import type { Deck } from '../application/decks';

const PREVIOUS_DECKS_DRAWN = 2;
const NEXT_DECKS_DRAWN = 8;
const ENLARGED_TEXT_PX = 28;

/**
 * A stack of decks that scrolls like a native list. The active deck sits near the top, with
 * earlier decks above and later decks below. The browser owns the drag, momentum and snap;
 * each card derives its place in the stack from the scroll position.
 */
export function DeckCarousel({
  decks,
  fillsScreen,
  initialIndex,
  onOpen,
}: Readonly<{
  decks: readonly Deck[];
  fillsScreen: boolean;
  initialIndex: number;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}>) {
  const [nearestIndex, setNearestIndex] = useState(initialIndex);
  const [nativeScroll, setNativeScroll] = useState(false);
  const selectedIndex = useRef(initialIndex);
  const carousel = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const snapPoints = useRef<HTMLDivElement>(null);
  const scrollStep = useRef(0);
  const frontLink = useRef<HTMLAnchorElement>(null);
  const focusWasInCarousel = useRef(false);
  const fittedStageHeight = useFittedStageHeight(carousel, fillsScreen);
  const frontIndex = Math.min(nearestIndex, decks.length - 1);
  const firstDeckId = decks[0].id;
  const frontDeck = decks[frontIndex];
  const position = `${frontIndex + 1} of ${decks.length}`;
  const firstDrawnIndex = Math.max(0, frontIndex - PREVIOUS_DECKS_DRAWN);
  const drawnDecks = decks.slice(firstDrawnIndex, frontIndex + NEXT_DECKS_DRAWN + 1);
  const stackSize = {
    '--deck-reach': Math.min(decks.length - 1, NEXT_DECKS_DRAWN),
    '--deck-stage-fitted': fittedStageHeight === null ? undefined : `${fittedStageHeight}px`,
  } as CSSProperties;

  useEffect(() => {
    const focusedControlWasRemoved = !carousel.current?.contains(document.activeElement);
    if (focusWasInCarousel.current && focusedControlWasRemoved)
      frontLink.current?.focus({ preventScroll: nativeScroll });
    focusWasInCarousel.current = false;
  }, [frontIndex, nativeScroll]);

  const selectDeck = useCallback((index: number) => {
    if (index === selectedIndex.current) return;
    selectedIndex.current = index;
    focusWasInCarousel.current = carousel.current?.contains(document.activeElement) ?? false;
    setNearestIndex(index);
  }, []);

  useLayoutEffect(() => {
    const section = carousel.current;
    const element = scroller.current;
    const points = snapPoints.current;
    const firstPoint = points?.firstElementChild;
    if (!section || !element || !firstPoint) return;
    let scrollFrame: number | null = null;
    const paintScrollPosition = () => {
      scrollFrame = null;
      const progress = scrollStep.current > 0 ? element.scrollTop / scrollStep.current : 0;
      stage.current?.style.setProperty('--deck-progress', String(progress));
      if (scrollStep.current === 0) return;
      selectDeck(Math.min(decks.length - 1, Math.max(0, Math.round(progress))));
    };
    function schedulePaint() {
      scrollFrame ??= window.requestAnimationFrame(paintScrollPosition);
    }
    const measureStep = () => {
      const enlargedText = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) >= ENLARGED_TEXT_PX;
      section.toggleAttribute('data-enlarged-text', enlargedText);
      const scrollsNatively = getComputedStyle(element).overflowY === 'auto';
      setNativeScroll(scrollsNatively);
      const step = scrollsNatively && decks.length > 1 ? firstPoint.getBoundingClientRect().height : 0;
      if (step !== scrollStep.current) {
        scrollStep.current = step;
        if (step > 0)
          element.scrollTo({ top: Math.min(selectedIndex.current, decks.length - 1) * step, behavior: 'instant' });
      }
      selectDeck(Math.min(selectedIndex.current, decks.length - 1));
      schedulePaint();
    };
    measureStep();
    const sizeChanges = new ResizeObserver(measureStep);
    sizeChanges.observe(firstPoint);
    sizeChanges.observe(element);
    element.addEventListener('scroll', schedulePaint, { passive: true });
    return () => {
      element.removeEventListener('scroll', schedulePaint);
      sizeChanges.disconnect();
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
    };
  }, [decks.length, firstDeckId, selectDeck]);

  function bringToFront(index: number) {
    const element = scroller.current;
    if (!element || !decks[index]) return;
    if (scrollStep.current > 0) element.scrollTop = index * scrollStep.current;
    else selectDeck(index);
  }

  return (
    <section
      ref={carousel}
      aria-label="Decks"
      aria-roledescription="carousel"
      className="deck-carousel @min-[64rem]/workspace:hidden"
      data-single-deck={decks.length === 1 ? '' : undefined}
      style={stackSize}
    >
      {decks.length > 1 && (
        <output
          aria-atomic="true"
          className="deck-carousel-position mb-2 block text-right text-support text-muted tabular-nums"
        >
          {position}
          <span className="sr-only">{`. ${frontDeck.title}`}</span>
        </output>
      )}
      <div ref={scroller} className="deck-carousel-scroller">
        <div ref={stage} className="deck-carousel-stage">
          {drawnDecks.map((drawnDeck, drawnOffset) => {
            const index = firstDrawnIndex + drawnOffset;
            return (
              <StackedDeck
                key={drawnDeck.id}
                deck={drawnDeck}
                index={index}
                stepsFromFront={index - frontIndex}
                position={position}
                frontLink={frontLink}
                scroller={scroller}
                nativeScroll={nativeScroll}
                onBringToFront={bringToFront}
                onOpen={onOpen}
              />
            );
          })}
        </div>
        <div ref={snapPoints} aria-hidden="true" className="deck-carousel-snap-points">
          {decks.map((snapDeck) => (
            <div key={snapDeck.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The stack's height when it may fill the screen: tall enough to reach the lowest point the page
 * shows without scrolling. Null keeps the default height. CSS still applies the stack's limits.
 */
function useFittedStageHeight(carousel: RefObject<HTMLElement | null>, fillsScreen: boolean) {
  const [fittedHeight, setFittedHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const section = carousel.current;
    if (!fillsScreen || !section) return;
    const fitToScreen = () => {
      const height = stageHeightReachingScreenBottom(section);
      if (height !== null) setFittedHeight(height);
    };
    fitToScreen();
    const sizeChanges = new ResizeObserver(fitToScreen);
    sizeChanges.observe(section);
    window.addEventListener('resize', fitToScreen);
    return () => {
      sizeChanges.disconnect();
      window.removeEventListener('resize', fitToScreen);
    };
  }, [carousel, fillsScreen]);

  return fillsScreen ? fittedHeight : null;
}

/** Null when the stack is not laid out, such as in the desktop grid layout. */
function stageHeightReachingScreenBottom(section: HTMLElement): number | null {
  const stage = section.querySelector<HTMLElement>('.deck-carousel-scroller');
  const page = section.closest('main');
  if (!stage?.offsetHeight || !page) return null;
  const spaceKeptFreeAtBottom = Number.parseFloat(getComputedStyle(page).paddingBottom);
  const lowestVisibleContent = document.documentElement.clientHeight - spaceKeptFreeAtBottom;
  const sectionBottom = section.getBoundingClientRect().bottom + window.scrollY;
  return Math.floor(stage.offsetHeight + lowestVisibleContent - sectionBottom);
}

type StackedDeckProps = Readonly<{
  deck: Deck;
  index: number;
  stepsFromFront: number;
  position: string;
  frontLink: RefObject<HTMLAnchorElement | null>;
  scroller: RefObject<HTMLDivElement | null>;
  nativeScroll: boolean;
  onBringToFront: (index: number) => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}>;

function StackedDeck({
  deck,
  index,
  stepsFromFront,
  position,
  frontLink,
  scroller,
  nativeScroll,
  onBringToFront,
  onOpen,
}: StackedDeckProps) {
  const distanceFromFront = Math.abs(stepsFromFront);
  const placeInStack = { '--deck-index': index, '--deck-layer': -distanceFromFront } as CSSProperties;
  if (stepsFromFront === 0) {
    return (
      <article
        aria-roledescription="slide"
        aria-label={position}
        className="deck-carousel-card"
        data-slot="front"
        data-paused={deck.archived ? '' : undefined}
        data-first-deck={index === 0 ? '' : undefined}
        style={placeInStack}
      >
        <FrontDeckLink
          deck={deck}
          index={index}
          frontLink={frontLink}
          onBringToFront={onBringToFront}
          onOpen={onOpen}
        />
      </article>
    );
  }
  const above = stepsFromFront < 0;
  const adjacent = distanceFromFront === 1;
  const adjacentLabel = above ? 'Previous deck' : 'Next deck';
  return (
    <div
      className="deck-carousel-card"
      data-adjacent={adjacent ? '' : undefined}
      data-paused={deck.archived ? '' : undefined}
      data-first-deck={index === 0 ? '' : undefined}
      data-after-first={index === 1 && stepsFromFront === 1 ? '' : undefined}
      style={placeInStack}
    >
      <div
        aria-hidden="true"
        className="deck-carousel-preview-art pointer-events-none size-full items-center gap-2 p-compact-gutter @max-[22rem]:px-3"
      >
        <span className="deck-carousel-title min-w-0 flex-1 wrap-anywhere">{deck.title}</span>
      </div>
      <DeckPreview
        deck={deck}
        adjacent={adjacent}
        above={above}
        label={adjacent ? adjacentLabel : 'Go to deck'}
        scroller={scroller}
        nativeScroll={nativeScroll}
        onChoose={() => onBringToFront(index)}
      />
    </div>
  );
}

type DeckPreviewProps = Readonly<{
  deck: Deck;
  adjacent: boolean;
  above: boolean;
  label: string;
  scroller: RefObject<HTMLDivElement | null>;
  nativeScroll: boolean;
  onChoose: () => void;
}>;

function DeckPreview({ deck, adjacent, above, label, scroller, nativeScroll, onChoose }: DeckPreviewProps) {
  const button = useRef<HTMLButtonElement>(null);
  const [hasRoom, setHasRoom] = useState(false);
  useEffect(() => {
    const element = button.current;
    const root = scroller.current;
    if (!nativeScroll || !element || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHasRoom(entry.intersectionRatio >= 0.94 && entry.intersectionRect.height >= 48),
      { root, threshold: 0.94 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nativeScroll, scroller]);
  const canTap = adjacent || (nativeScroll && hasRoom);
  return (
    <button
      ref={button}
      type="button"
      disabled={!canTap}
      aria-hidden={canTap ? undefined : true}
      tabIndex={adjacent ? undefined : -1}
      aria-label={`${label}: ${deck.title}${deck.archived ? ', paused' : ''}`}
      className={`deck-carousel-peek pressable disabled:pointer-events-none ${above ? 'top-0' : 'bottom-0'}`}
      onClick={onChoose}
    >
      <span className="deck-carousel-preview-title block min-w-0 wrap-anywhere">{deck.title}</span>
    </button>
  );
}

function FrontDeckLink({
  deck,
  index,
  frontLink,
  onBringToFront,
  onOpen,
}: Pick<StackedDeckProps, 'deck' | 'index' | 'frontLink' | 'onBringToFront' | 'onOpen'>) {
  const countId = useId();
  return (
    <Link
      to={deckPath(deck.id)}
      aria-label={`Open ${deck.title}`}
      aria-describedby={countId}
      data-library-deck={deck.id}
      onClick={onOpen}
      ref={frontLink}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        onBringToFront(event.key === 'ArrowUp' ? index - 1 : index + 1);
      }}
      className="pressable block size-full rounded-card"
    >
      <DeckSummary deck={deck} countId={countId} />
    </Link>
  );
}

function DeckSummary({ deck, countId }: Readonly<{ deck: Deck; countId: string }>) {
  return (
    <div className="deck-carousel-summary flex size-full items-center gap-3 p-compact-gutter @max-[24rem]:gap-2 @max-[22rem]:px-3">
      <span
        aria-hidden="true"
        className={`deck-carousel-symbol grid size-[40px] shrink-0 place-items-center rounded-inset @max-[24rem]:size-8 @max-[20rem]:hidden ${deck.archived ? 'bg-subtle text-muted' : 'bg-accent-soft text-accent'}`}
      >
        {deck.archived ? <CirclePause className="size-[21px]" /> : <Layers2 className="size-[21px]" />}
      </span>
      <div className="relative min-w-0 flex-1">
        <h3 className="deck-carousel-title text-section font-bold tracking-tight wrap-anywhere @max-[24rem]:text-body">
          {deck.title}
        </h3>
        <p
          id={countId}
          className="deck-carousel-count mt-1 flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-support text-muted"
        >
          {cardCountLabel(deck.cardCount)}
          {deck.archived && <span className="sr-only">, paused</span>}
        </p>
      </div>
      <ChevronRight
        aria-hidden="true"
        className="deck-carousel-symbol size-5 shrink-0 text-accent @max-[17rem]:hidden"
      />
    </div>
  );
}
