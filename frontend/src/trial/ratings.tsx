// The four recall ratings, shared by the trial's rating buttons and the landing page's sample.
// They are the grades the scheduler uses, from weakest to strongest recall; "Again" shows as Missed.

export type Rating = 'again' | 'hard' | 'good' | 'easy';

type RatingDetails = {
  label: string;
  meaning: string;
  /** 1 to 4: how many parts of the meter are filled. */
  level: number;
  /** Tailwind classes for the background tint and the meter's filled parts. */
  tint: string;
  meter: string;
};

// The level shows three ways: the label, the meter and the color.
export const RATINGS: Record<Rating, RatingDetails> = {
  again: { label: 'Missed', meaning: 'Wrong or a guess', level: 1, tint: 'bg-missed-soft', meter: 'fill-missed' },
  hard: { label: 'Hard', meaning: 'Right, with effort', level: 2, tint: 'bg-hard-soft', meter: 'fill-hard' },
  good: { label: 'Good', meaning: 'Right, with a pause', level: 3, tint: 'bg-good-soft', meter: 'fill-good' },
  easy: { label: 'Easy', meaning: 'Right, instantly', level: 4, tint: 'bg-easy-soft', meter: 'fill-easy' },
};

export const RATINGS_IN_ORDER: Rating[] = ['again', 'hard', 'good', 'easy'];

/** A four-quadrant ring fills clockwise as recall gets stronger. */
export function RecallMeter({ rating }: { rating: Rating }) {
  const { level, meter } = RATINGS[rating];
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0">
      {[0, 1, 2, 3].map((quadrant) => (
        <path
          key={quadrant}
          d="M13 2 A10 10 0 0 1 22 11 L18 11 A6 6 0 0 0 13 6 Z"
          transform={`rotate(${quadrant * 90} 12 12)`}
          className={quadrant < level ? meter : 'fill-ink/15'}
        />
      ))}
    </svg>
  );
}

/** A rating shown, not chosen: the same look as a rating button, without a button's shadow or states. */
export function RatingTag({ rating }: { rating: Rating }) {
  const { label, meaning, tint } = RATINGS[rating];
  return (
    <p className={`inline-flex items-center gap-2.5 rounded-control px-3 py-2 ${tint}`}>
      <RecallMeter rating={rating} />
      <span>
        <span className="sr-only">Rated </span>
        <span className="font-bold">{label}</span>
        <span className="text-muted">: {meaning}</span>
      </span>
    </p>
  );
}
