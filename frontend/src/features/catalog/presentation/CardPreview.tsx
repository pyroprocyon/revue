import { BookOpenText, Lightbulb, Link2, type LucideIcon } from 'lucide-react';
import type { Ref } from 'react';
import type { DeckCard } from '../application/decks';

type CardExtra = { label: string; value: string; icon: LucideIcon; tile: string };

// Tip to remember uses the coral tint of Review's "Try to remember" hint; the other details stay indigo.
const indigoTile = 'bg-accent-soft text-accent';
const coralTile = 'bg-highlight-soft text-ink';

/** A card's optional details, in the order the editor lists them. */
export function cardExtras(card: DeckCard): CardExtra[] {
  const extras: CardExtra[] = [];
  if (card.explanation) {
    extras.push({ label: 'Explanation', value: card.explanation, icon: BookOpenText, tile: indigoTile });
  }
  if (card.memoryHook) {
    extras.push({ label: 'Tip to remember', value: card.memoryHook, icon: Lightbulb, tile: coralTile });
  }
  if (card.source) extras.push({ label: 'Source', value: card.source, icon: Link2, tile: indigoTile });
  return extras;
}

const sideLabel = 'inline-flex rounded-full px-2.5 py-0.5 text-[0.8125rem] font-bold';
const cardText = 'text-section whitespace-pre-wrap wrap-anywhere @min-[34rem]/preview:text-[1.5rem]';

type CardPreviewProps = {
  card: DeckCard;
  questionId: string;
  due?: boolean;
  savedSet?: boolean;
  /** The phone card screen moves focus here when it opens, rather than to its first button. */
  questionRef?: Ref<HTMLHeadingElement>;
};

export function CardPreview({
  card,
  questionId,
  due = false,
  savedSet = false,
  questionRef,
}: Readonly<CardPreviewProps>) {
  const extras = cardExtras(card);
  return (
    <div className="@container/preview">
      {due && (
        <p className="mb-2 flex items-center gap-1.5 text-support font-semibold text-due">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-due" /> Due today
        </p>
      )}
      <h2 ref={questionRef} id={questionId} tabIndex={-1} className={`${cardText} font-bold outline-none`}>
        {card.question}
      </h2>
      <div className={`mt-4 rounded-[1.25rem] px-4 pt-3.5 pb-4 ${savedSet ? 'bg-saved-set-soft' : 'bg-accent-soft'}`}>
        <span className={`${sideLabel} bg-surface ${savedSet ? 'text-saved-set' : 'text-accent'}`}>Answer</span>
        <p className={`mt-2 ${cardText} font-bold ${savedSet ? 'text-ink' : 'text-accent-strong'}`}>{card.answer}</p>
      </div>
      {extras.length > 0 && (
        <dl className="mt-5 grid gap-4">
          {extras.map(({ label, value, icon: Icon, tile }) => (
            <div key={label} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
              <span aria-hidden="true" className={`grid size-8 place-items-center rounded-inset ${tile}`}>
                <Icon className="size-4" />
              </span>
              <div>
                <dt className="text-support font-bold">{label}</dt>
                <dd className="mt-0.5 text-support text-muted whitespace-pre-wrap wrap-anywhere">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
