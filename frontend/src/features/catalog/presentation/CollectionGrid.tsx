import { ChevronRight } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type MouseEvent, type RefObject } from 'react';
import { Link } from 'react-router';
import { deckCollectionLink, type CollectionItem, type CollectionLinkItem } from './collectionItem';
import { useCollectionLayoutVisible } from './useCollectionLayoutVisible';

type OpenCollection = (event: MouseEvent<HTMLAnchorElement>) => void;
const collectionLabels = { subjects: 'Subjects', topics: 'Topics' };
const PREFETCH_MARGIN = '0px 0px 240px';

export function CollectionGrid({
  decks,
  onOpen,
}: Readonly<{ decks: readonly CollectionItem[]; onOpen: OpenCollection }>) {
  return <CollectionTiles items={decks.map(deckCollectionLink)} onOpen={onOpen} />;
}

export function CollectionTiles({
  items,
  onOpen,
  kind,
  focusId,
  onRestoreFocus,
  onNearEnd,
}: Readonly<{
  items: readonly CollectionLinkItem[];
  onOpen: OpenCollection;
  kind?: 'subjects' | 'topics';
  focusId?: string;
  onRestoreFocus?: (link: HTMLAnchorElement) => void;
  onNearEnd?: () => void;
}>) {
  const grid = useRef<HTMLUListElement>(null);
  const toFocus = useRef<HTMLAnchorElement>(null);
  const visible = useCollectionLayoutVisible(grid);
  useLayoutEffect(() => {
    if (!visible || !focusId || !toFocus.current) return;
    if (onRestoreFocus) onRestoreFocus(toFocus.current);
    else toFocus.current.focus();
  }, [visible, focusId, onRestoreFocus]);
  const lastItemId = items.at(-1)?.id;
  useLayoutEffect(() => {
    const lastTile = grid.current?.lastElementChild;
    if (!visible || !lastTile || !onNearEnd) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onNearEnd();
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(lastTile);
    return () => observer.disconnect();
  }, [visible, lastItemId, onNearEnd]);
  return (
    <ul
      ref={grid}
      aria-label={kind && collectionLabels[kind]}
      className="collection-grid hidden auto-rows-fr grid-cols-2 gap-4 @min-[64rem]/workspace:grid"
    >
      {visible &&
        items.map((item) => (
          <CollectionTile
            key={item.id}
            item={item}
            kind={kind}
            linkRef={item.id === focusId ? toFocus : undefined}
            onOpen={onOpen}
          />
        ))}
    </ul>
  );
}

function CollectionTile({
  item,
  onOpen,
  kind,
  linkRef,
}: Readonly<{
  item: CollectionLinkItem;
  onOpen: OpenCollection;
  kind?: 'subjects' | 'topics';
  linkRef?: RefObject<HTMLAnchorElement | null>;
}>) {
  const countId = useId();
  const Heading = kind ? 'h2' : 'h3';
  return (
    <li className="min-w-0">
      <Link
        ref={linkRef}
        to={item.to}
        state={item.state}
        aria-label={`Open ${item.title}`}
        aria-describedby={countId}
        data-library-deck={item.id}
        data-saved={item.saved ? '' : undefined}
        onClick={onOpen}
        className={`pressable flex h-full min-h-24 min-w-0 flex-col justify-between gap-3 rounded-control px-5 py-4 ${item.archived ? 'bg-subtle text-muted' : 'shadow-control hover:shadow-card'} ${kind === 'subjects' ? 'border border-saved-set/25 bg-surface' : ''}`}
      >
        {item.icon}
        <Heading className="text-section leading-snug font-bold tracking-tight text-balance wrap-anywhere">
          {item.title}
        </Heading>
        <div className="flex items-center justify-between gap-2">
          <div id={countId} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className={`collection-count rounded-full px-2.5 py-0.5 text-support font-medium tabular-nums ${item.archived ? 'bg-surface text-muted' : 'bg-accent-soft text-accent-strong'}`}
            >
              {item.countLabel}
              {item.archived && <span className="sr-only">, paused</span>}
            </p>
            {item.inLibrary && <span className="collection-saved-badge">Saved</span>}
          </div>
          <ChevronRight aria-hidden="true" className="collection-arrow size-5 shrink-0 text-accent" />
        </div>
      </Link>
    </li>
  );
}
