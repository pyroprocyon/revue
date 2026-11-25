import { ChevronRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link } from 'react-router';
import { deckCollectionLink, type CollectionItem, type CollectionLinkItem } from './collectionItem';
import { useCollectionLayoutVisible } from './useCollectionLayoutVisible';

const PREVIOUS_DECKS_DRAWN = 2;
const NEXT_DECKS_DRAWN = 8;
const ENLARGED_TEXT_PX = 28;
const MIN_CATALOG_STACK_VIEWPORT_PX = 480;
const ITEMS_AHEAD_FOR_NEXT_PAGE = 1;

type CarouselKind = 'decks' | 'saved' | 'subjects' | 'topics';

const carouselLabels = {
  decks: { region: 'Decks', item: 'deck' },
  saved: { region: 'Saved reviewers', item: 'reviewer' },
  subjects: { region: 'Subjects', item: 'subject' },
  topics: { region: 'Topics', item: 'topic' },
};

type CarouselNavigation = Readonly<{
  fillsScreen: boolean;
  initialIndex: number;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}>;

export function DeckCarousel({ decks, ...navigation }: CarouselNavigation & { decks: readonly CollectionItem[] }) {
  return (
    <CollectionCarousel
      {...navigation}
      kind={decks[0]?.savedSetPath ? 'saved' : 'decks'}
      items={decks.map(deckCollectionLink)}
    />
  );
}

/**
 * A stack that scrolls like a native list. The active card sits near the top, with
 * earlier cards above and later cards below. The browser owns the drag, momentum and snap;
 * each card derives its place in the stack from the scroll position.
 */
export function CollectionCarousel({
  items,
  kind,
  focusId,
  onRestoreFocus,
  onNearEnd,
  fillsScreen,
  initialIndex,
  onOpen,
}: CarouselNavigation &
  Readonly<{
    items: readonly CollectionLinkItem[];
    kind: CarouselKind;
    focusId?: string;
    onRestoreFocus?: (link: HTMLAnchorElement) => void;
    onNearEnd?: () => void;
  }>) {
  const [selection, setSelection] = useState(() => ({ index: initialIndex, id: items[initialIndex]?.id }));
  const [nativeScroll, setNativeScroll] = useState(false);
  const currentItems = useRef(items);
  const selectedIndex = useRef(initialIndex);
  const carousel = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const snapPoints = useRef<HTMLDivElement>(null);
  const scrollStep = useRef(0);
  const frontLink = useRef<HTMLAnchorElement>(null);
  const restoredFocusId = useRef<string | undefined>(undefined);
  const focusWasInCarousel = useRef(false);
  const visible = useCollectionLayoutVisible(carousel);
  const fittedStageHeight = useFittedStageHeight(carousel, fillsScreen && visible);
  const retainedIndex =
    items[selection.index]?.id === selection.id ? selection.index : items.findIndex(({ id }) => id === selection.id);
  const frontIndex = Math.min(retainedIndex === -1 ? selection.index : retainedIndex, items.length - 1);
  const frontDeck = items[frontIndex];
  if (selection.index !== frontIndex || selection.id !== frontDeck?.id) {
    setSelection({ index: frontIndex, id: frontDeck?.id });
  }
  const catalog = kind === 'subjects' || kind === 'topics';
  const labels = carouselLabels[kind];
  const position = !catalog && items.length > 1 ? `${frontIndex + 1} of ${items.length}` : undefined;
  const firstDrawnIndex = Math.max(0, frontIndex - PREVIOUS_DECKS_DRAWN);
  const drawnDecks = items.slice(firstDrawnIndex, frontIndex + NEXT_DECKS_DRAWN + 1);
  const stackSize = {
    '--deck-reach': Math.min(items.length - 1, NEXT_DECKS_DRAWN),
    '--deck-stage-fitted': fittedStageHeight === null ? undefined : `${fittedStageHeight}px`,
  } as CSSProperties;

  useLayoutEffect(() => {
    currentItems.current = items;
    if (selectedIndex.current === frontIndex) return;
    selectedIndex.current = frontIndex;
    if (scrollStep.current > 0) {
      scroller.current?.scrollTo({ top: frontIndex * scrollStep.current, behavior: 'instant' });
    }
  }, [items, frontIndex]);

  useEffect(() => {
    if (visible && frontIndex >= items.length - 1 - ITEMS_AHEAD_FOR_NEXT_PAGE) onNearEnd?.();
  }, [frontIndex, items.length, onNearEnd, visible]);

  useEffect(() => {
    const focusedControlWasRemoved = !carousel.current?.contains(document.activeElement);
    if (focusWasInCarousel.current && focusedControlWasRemoved)
      frontLink.current?.focus({ preventScroll: nativeScroll });
    focusWasInCarousel.current = false;
  }, [frontIndex, nativeScroll]);

  useLayoutEffect(() => {
    if (focusId === undefined || restoredFocusId.current === focusId || !frontLink.current) return;
    if (onRestoreFocus) onRestoreFocus(frontLink.current);
    else frontLink.current.focus({ preventScroll: true });
    restoredFocusId.current = focusId;
  }, [focusId, visible, onRestoreFocus]);

  const selectDeck = useCallback((index: number) => {
    if (index === selectedIndex.current) return;
    selectedIndex.current = index;
    focusWasInCarousel.current = carousel.current?.contains(document.activeElement) ?? false;
    setSelection({ index, id: currentItems.current[index]?.id });
  }, []);

  useLayoutEffect(() => {
    if (!visible) {
      scrollStep.current = 0;
      return;
    }
    const section = carousel.current;
    const element = scroller.current;
    const points = snapPoints.current;
    const firstPoint = points?.firstElementChild;
    if (!section || !element || !firstPoint) return;
    let selectionObserver: IntersectionObserver | undefined;
    let observedHeight = -1;
    const measureStep = () => {
      const enlargedText = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) >= ENLARGED_TEXT_PX;
      const shortCatalogViewport = catalog && window.innerHeight < MIN_CATALOG_STACK_VIEWPORT_PX;
      section.toggleAttribute('data-flow-stack', enlargedText || shortCatalogViewport);
      const scrollsNatively = getComputedStyle(element).overflowY === 'auto';
      setNativeScroll(scrollsNatively);
      const step = scrollsNatively && items.length > 1 ? firstPoint.getBoundingClientRect().height : 0;
      const height = element.clientHeight;
      const stepChanged = step !== scrollStep.current;
      scrollStep.current = step;
      const index = Math.min(selectedIndex.current, items.length - 1);
      selectDeck(index);
      if (stepChanged && step > 0) element.scrollTo({ top: index * step, behavior: 'instant' });
      if (!stepChanged && height === observedHeight) return;
      observedHeight = height;
      selectionObserver?.disconnect();
      if (step === 0) return;

      const midpoint = step / 2;
      const nearestSnapPointMargin = `-${midpoint}px 0px -${height - midpoint}px 0px`;
      selectionObserver = new IntersectionObserver(
        () => selectDeck(Math.max(0, Math.min(items.length - 1, Math.round(element.scrollTop / step)))),
        { root: element, rootMargin: nearestSnapPointMargin },
      );
      for (const point of points.children) selectionObserver.observe(point);
    };
    measureStep();
    const sizeChanges = new ResizeObserver(measureStep);
    sizeChanges.observe(firstPoint);
    sizeChanges.observe(element);
    if (catalog) window.addEventListener('resize', measureStep);
    return () => {
      if (catalog) window.removeEventListener('resize', measureStep);
      selectionObserver?.disconnect();
      sizeChanges.disconnect();
    };
  }, [items.length, selectDeck, catalog, visible]);

  function bringToFront(index: number) {
    const element = scroller.current;
    if (!element || !items[index]) return;
    if (scrollStep.current > 0) element.scrollTop = index * scrollStep.current;
    else selectDeck(index);
  }

  return (
    <section
      ref={carousel}
      aria-label={labels.region}
      data-saved={kind !== 'decks' ? '' : undefined}
      data-named-previews={catalog ? '' : undefined}
      aria-roledescription="carousel"
      className="deck-carousel @min-[64rem]/workspace:hidden"
      data-single-deck={items.length === 1 ? '' : undefined}
      style={stackSize}
    >
      {visible && (position || (catalog && items.length > 1)) && (
        <output aria-atomic="true" className="sr-only">
          {position ? `${position}. ${frontDeck.title}` : frontDeck.title}
        </output>
      )}
      {visible && (
        <div ref={scroller} className="deck-carousel-scroller">
          <div className="deck-carousel-stage">
            {drawnDecks.map((drawnDeck, drawnOffset) => {
              const index = firstDrawnIndex + drawnOffset;
              return (
                <StackedDeck
                  key={drawnDeck.id}
                  deck={drawnDeck}
                  index={index}
                  stepsFromFront={index - frontIndex}
                  position={position}
                  kind={kind}
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
            {/* Snap points represent positions, so replacing a deck keeps its observed element. */}
            {Array.from(items.keys(), (position) => (
              <div key={position} />
            ))}
          </div>
        </div>
      )}
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
  deck: CollectionLinkItem;
  kind: CarouselKind;
  index: number;
  stepsFromFront: number;
  position?: string;
  frontLink: RefObject<HTMLAnchorElement | null>;
  scroller: RefObject<HTMLDivElement | null>;
  nativeScroll: boolean;
  onBringToFront: (index: number) => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}>;

function StackedDeck({
  deck,
  kind,
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
  const atFront = distanceFromFront === 0;
  const above = stepsFromFront < 0;
  const adjacent = distanceFromFront === 1;
  const noun = carouselLabels[kind].item;
  const catalog = kind === 'subjects' || kind === 'topics';
  const previewIcon = catalog ? deck.icon : null;
  const direction = above ? 'Previous' : 'Next';
  const previewLabel = adjacent ? `${direction} ${noun}` : `Go to ${noun}`;
  const slideLabel = catalog ? deck.title : (position ?? '1 of 1');
  const placeInStack = {
    '--deck-index': index,
    '--deck-offset': stepsFromFront,
    '--deck-layer': -distanceFromFront,
  } as CSSProperties;
  return (
    <article
      role={atFront ? undefined : 'presentation'}
      aria-roledescription={atFront ? 'slide' : undefined}
      aria-label={atFront ? slideLabel : undefined}
      className="deck-carousel-card"
      data-slot={atFront ? 'front' : undefined}
      data-adjacent={adjacent ? '' : undefined}
      data-paused={deck.archived ? '' : undefined}
      data-first-deck={index === 0 ? '' : undefined}
      data-after-first={index === 1 && stepsFromFront === 1 ? '' : undefined}
      style={placeInStack}
    >
      {atFront ? (
        <FrontDeckLink
          deck={deck}
          index={index}
          position={position}
          kind={kind}
          frontLink={frontLink}
          onBringToFront={onBringToFront}
          onOpen={onOpen}
        />
      ) : (
        <>
          <div
            aria-hidden="true"
            className="deck-carousel-preview-art pointer-events-none size-full items-center gap-2 p-compact-gutter @max-[22rem]:px-3"
          >
            {previewIcon}
            <span className="deck-carousel-title min-w-0 flex-1 wrap-anywhere">{deck.title}</span>
          </div>
          <DeckPreview
            deck={deck}
            adjacent={adjacent}
            above={above}
            label={previewLabel}
            icon={previewIcon}
            scroller={scroller}
            nativeScroll={nativeScroll}
            onChoose={() => onBringToFront(index)}
          />
        </>
      )}
    </article>
  );
}

type DeckPreviewProps = Readonly<{
  deck: CollectionLinkItem;
  adjacent: boolean;
  above: boolean;
  label: string;
  icon: ReactNode;
  scroller: RefObject<HTMLDivElement | null>;
  nativeScroll: boolean;
  onChoose: () => void;
}>;

function DeckPreview({ deck, adjacent, above, label, icon, scroller, nativeScroll, onChoose }: DeckPreviewProps) {
  const button = useRef<HTMLButtonElement>(null);
  const [hasRoom, setHasRoom] = useState(false);
  useEffect(() => {
    const element = button.current;
    const root = scroller.current;
    if (adjacent || !nativeScroll || !element || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHasRoom(entry.intersectionRatio >= 0.94 && entry.intersectionRect.height >= 48),
      { root, threshold: 0.94 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [adjacent, nativeScroll, scroller]);
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
      <span className={`deck-carousel-preview-title min-w-0 wrap-anywhere ${icon ? 'flex' : 'block'}`}>
        {icon}
        {deck.title}
      </span>
    </button>
  );
}

function FrontDeckLink({
  deck,
  kind,
  index,
  position,
  frontLink,
  onBringToFront,
  onOpen,
}: Pick<StackedDeckProps, 'deck' | 'kind' | 'index' | 'position' | 'frontLink' | 'onBringToFront' | 'onOpen'>) {
  const countId = useId();
  return (
    <Link
      to={deck.to}
      state={deck.state}
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
      className={`pressable size-full rounded-card ${position ? 'grid grid-rows-[1fr_auto_1fr]' : 'block'}`}
    >
      {position && (
        <span
          aria-hidden="true"
          className={`deck-carousel-position mx-compact-gutter mt-2 self-start justify-self-end rounded-full border bg-surface px-2.5 py-0.5 text-[0.8125rem] leading-snug font-medium tabular-nums sm:text-support ${kind === 'saved' ? 'border-saved-set/30 text-saved-set' : 'border-accent/30 text-accent-strong'}`}
        >
          {position}
        </span>
      )}
      <DeckSummary deck={deck} countId={countId} />
    </Link>
  );
}

function DeckSummary({ deck, countId }: Readonly<{ deck: CollectionLinkItem; countId: string }>) {
  return (
    <div className="deck-carousel-summary flex size-full items-center gap-3 p-compact-gutter @max-[24rem]:gap-2 @max-[22rem]:px-3">
      {deck.icon}
      <div className="relative min-w-0 flex-1">
        <h3 className="deck-carousel-title text-section font-bold tracking-tight wrap-anywhere @max-[24rem]:text-body">
          {deck.title}
        </h3>
        <p id={countId} className="mt-1 flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-support text-muted">
          {deck.countLabel}
          {deck.archived && <span className="sr-only">, paused</span>}
          {deck.inLibrary && <span className="collection-saved-badge">Saved</span>}
        </p>
      </div>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-accent @max-[17rem]:hidden" />
    </div>
  );
}
