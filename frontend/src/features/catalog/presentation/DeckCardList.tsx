import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode, type Ref } from 'react';
import type { DeckCard } from '../application/decks';
import { cardExtras } from './CardPreview';
import { ROW_SELECTION_HINT, moveRowSelection } from './rowSelection';

type DeckCardListProps = {
  cards: DeckCard[];
  dueIds: ReadonlySet<string>;
  emptyMessage: string | null;
  /** Wide screens select a card for the side pane; phones open it full screen. */
  wide: boolean;
  selectedId: string | null;
  onOpen: (card: DeckCard) => void;
  resultsRef: Ref<HTMLElement>;
};

export function DeckCardsHeader({ filter, pagination }: Readonly<{ filter: ReactNode; pagination: ReactNode }>) {
  if (!filter && !pagination) return null;
  return (
    <fieldset className="col-span-full min-w-0">
      <legend className="sr-only">Cards header</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {filter}
        {pagination && <div className="ml-auto">{pagination}</div>}
      </div>
    </fieldset>
  );
}

export function DeckCardList({
  cards,
  dueIds,
  emptyMessage,
  wide,
  selectedId,
  onOpen,
  resultsRef,
}: Readonly<DeckCardListProps>) {
  const keysHintId = useId();
  const dotColumn = cards.some((card) => dueIds.has(card.id));
  // One row stays reachable by Tab even when the pane shows something other than a card.
  const tabStopId = cards.some((card) => card.id === selectedId) ? selectedId : cards[0]?.id;
  return (
    <section ref={resultsRef} aria-label="Cards" tabIndex={-1} className="min-w-0 outline-none">
      {cards.length === 0 && emptyMessage && <output className="block text-body text-muted">{emptyMessage}</output>}
      {cards.length > 0 && (
        <ul
          aria-label="Cards"
          data-due-column={dotColumn || undefined}
          data-wide={wide || undefined}
          className="deck-card-list loading-reveal @container/cards grid rounded-card bg-surface p-1 shadow-control"
        >
          {cards.map((card) => (
            <li key={card.id} className="grid min-w-0">
              <CardRow
                card={card}
                due={dueIds.has(card.id)}
                dotColumn={dotColumn}
                wide={wide}
                selected={wide && card.id === selectedId}
                tabStop={card.id === tabStopId}
                keysHintId={keysHintId}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}
      {wide && (
        <p id={keysHintId} hidden>
          {ROW_SELECTION_HINT}
        </p>
      )}
    </section>
  );
}

type CardRowProps = {
  card: DeckCard;
  due: boolean;
  dotColumn: boolean;
  wide: boolean;
  selected: boolean;
  tabStop: boolean;
  keysHintId: string;
  onOpen: (card: DeckCard) => void;
};

function CardRow({ card, due, dotColumn, wide, selected, tabStop, keysHintId, onOpen }: Readonly<CardRowProps>) {
  const extras = cardExtras(card);
  const described = [due && 'Due today', ...extras.map(({ label }) => label)].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      data-card-row={card.id}
      aria-pressed={wide ? selected : undefined}
      tabIndex={wide && !tabStop ? -1 : undefined}
      aria-describedby={wide && tabStop ? keysHintId : undefined}
      aria-haspopup={wide ? undefined : 'dialog'}
      onClick={() => onOpen(card)}
      onKeyDown={wide ? moveRowSelection : undefined}
      className={`deck-card-row group pressable relative my-0.5 grid min-h-[48px] w-full scroll-mt-[calc(var(--deck-toolbar-bottom,0px)_+_0.5rem)] items-center gap-3 rounded-[calc(var(--radius-card)-0.25rem)] py-3 text-start aria-pressed:bg-accent-soft aria-pressed:before:absolute aria-pressed:before:inset-y-3 aria-pressed:before:left-0 aria-pressed:before:w-[3px] aria-pressed:before:rounded-full aria-pressed:before:bg-accent @max-[20rem]/cards:grid-cols-1 ${wide ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_auto]'}`}
    >
      <span
        className={`grid min-w-0 gap-x-(--card-due-size) ${dotColumn ? 'grid-cols-[var(--card-due-size)_minmax(0,1fr)]' : 'grid-cols-1'}`}
      >
        {dotColumn && (
          <span
            aria-hidden="true"
            className={`size-(--card-due-size) self-center rounded-full ${due ? 'bg-due' : ''}`}
          />
        )}
        <span className="min-w-0">
          <span className="line-clamp-2 text-label font-semibold whitespace-pre-line wrap-anywhere group-aria-pressed:text-accent-strong @min-[20rem]/workspace:@max-[20rem]/cards:line-clamp-3 @max-[20rem]/workspace:line-clamp-5">
            {card.question}
          </span>
          {extras.length > 0 && (
            <span aria-hidden="true" className="mt-1.5 flex h-4 items-center gap-1.5 text-muted">
              {extras.map(({ label, icon: Icon }) => (
                <Icon key={label} className="size-3.5 shrink-0" />
              ))}
            </span>
          )}
          {described && <span className="sr-only">{described}</span>}
        </span>
      </span>
      {!wide && <ChevronRight aria-hidden="true" className="size-5 text-muted @max-[20rem]/cards:hidden" />}
    </button>
  );
}
