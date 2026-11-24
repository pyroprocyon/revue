import { CollectionIcon } from '../../../shared/ui/CollectionIcon';
import { ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { collectionKind, collectionItemPath, type CollectionItem } from './collectionItem';

export function CollectionGrid({
  decks,
  onOpen,
}: Readonly<{ decks: readonly CollectionItem[]; onOpen: (event: MouseEvent<HTMLAnchorElement>) => void }>) {
  const grid = useRef<HTMLUListElement>(null);
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    // The workspace container query decides when the grid has a box. Mount its links
    // before focus is restored on desktop and skip building hidden tiles on phones.
    setVisible(element.getClientRects().length > 0);
    const sizeChanges = new ResizeObserver(([entry]) => setVisible(entry.contentRect.width > 0));
    sizeChanges.observe(element);
    return () => sizeChanges.disconnect();
  }, []);
  return (
    <ul ref={grid} className="collection-grid hidden auto-rows-fr grid-cols-2 gap-4 @min-[64rem]/workspace:grid">
      {visible && decks.map((deck) => <DeckTile key={deck.id} deck={deck} onOpen={onOpen} />)}
    </ul>
  );
}

function DeckTile({
  deck,
  onOpen,
}: Readonly<{ deck: CollectionItem; onOpen: (event: MouseEvent<HTMLAnchorElement>) => void }>) {
  const countId = `grid-deck-${deck.id}-card-count`;
  return (
    <li className="min-w-0">
      <Link
        to={collectionItemPath(deck)}
        aria-label={`Open ${deck.title}`}
        aria-describedby={countId}
        data-library-deck={deck.id}
        data-saved={deck.savedSetPath ? '' : undefined}
        onClick={onOpen}
        className={`pressable flex h-full min-h-24 min-w-0 flex-col justify-between gap-3 rounded-control px-5 py-4 ${deck.archived ? 'bg-subtle text-muted' : 'shadow-control hover:shadow-card'}`}
      >
        <CollectionIcon kind={collectionKind(deck)} />
        <h3 className="text-section leading-snug font-bold tracking-tight text-balance wrap-anywhere">{deck.title}</h3>
        <div className="flex items-center justify-between gap-2">
          <p
            id={countId}
            className={`collection-count rounded-full px-2.5 py-0.5 text-support font-medium tabular-nums ${deck.archived ? 'bg-surface text-muted' : 'bg-accent-soft text-accent-strong'}`}
          >
            {cardCountLabel(deck.cardCount)}
            {deck.archived && <span className="sr-only">, paused</span>}
          </p>
          <ChevronRight aria-hidden="true" className="collection-arrow size-5 shrink-0 text-accent" />
        </div>
      </Link>
    </li>
  );
}
