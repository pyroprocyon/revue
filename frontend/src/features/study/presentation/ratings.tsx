// The four recall ratings, shared by the trial's rating buttons and the landing page's sample.
// They are the grades the scheduler uses, from weakest to strongest recall; "Again" shows as Missed.

import { RATING_MEANINGS, type Rating } from '../domain/ratings';
export type { Rating } from '../domain/ratings';

type RatingDetails = {
  label: string;
  meaning: string;
  /** 1 to 4: how many parts of the meter are filled. */
  level: number;
  tintClass: string;
  meterFillClass: string;
};

// The level shows three ways: the label, the meter and the color.
export const RATINGS: Record<Rating, RatingDetails> = {
  again: { ...RATING_MEANINGS.again, tintClass: 'bg-missed-soft', meterFillClass: 'fill-missed' },
  hard: { ...RATING_MEANINGS.hard, tintClass: 'bg-hard-soft', meterFillClass: 'fill-hard' },
  good: { ...RATING_MEANINGS.good, tintClass: 'bg-good-soft', meterFillClass: 'fill-good' },
  easy: { ...RATING_MEANINGS.easy, tintClass: 'bg-easy-soft', meterFillClass: 'fill-easy' },
};

export const RATINGS_IN_ORDER: Rating[] = ['again', 'hard', 'good', 'easy'];

/** A four-quadrant ring fills clockwise as recall gets stronger. */
export function RecallMeter({ rating }: Readonly<{ rating: Rating }>) {
  const { level, meterFillClass } = RATINGS[rating];
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0">
      {[0, 1, 2, 3].map((quadrant) => (
        <path
          key={quadrant}
          d="M13 2 A10 10 0 0 1 22 11 L18 11 A6 6 0 0 0 13 6 Z"
          transform={`rotate(${quadrant * 90} 12 12)`}
          className={quadrant < level ? meterFillClass : 'fill-ink/15'}
        />
      ))}
    </svg>
  );
}

/** A rating shown, not chosen: the same look as a rating button, without a button's shadow or states. */
export function RatingTag({ rating }: Readonly<{ rating: Rating }>) {
  const { label, meaning, tintClass } = RATINGS[rating];
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-control px-2 py-1 max-lg:text-label lg:gap-2.5 lg:px-3 lg:py-2 ${tintClass}`}
    >
      <RecallMeter rating={rating} />
      <span>
        <span className="sr-only">Rated </span>
        <span className="font-bold">{label}</span>
        <span className="text-muted">: {meaning}</span>
      </span>
    </p>
  );
}
