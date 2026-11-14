import { RATINGS, RATINGS_IN_ORDER, RecallMeter, type Rating } from './ratings';

export function RatingButtons({ onRate }: Readonly<{ onRate: (rating: Rating) => void }>) {
  return (
    <fieldset className="@container min-w-0 text-left">
      <legend className="text-label font-semibold">
        Rate your answer
      </legend>
      {/* Use the card's available space, including enlarged text, rather than the window width. */}
      <div className="mt-3 grid auto-rows-fr grid-cols-1 gap-2 @min-[18rem]:grid-cols-2 @min-[38rem]:grid-cols-4">
        {RATINGS_IN_ORDER.map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onRate(rating)}
            // A direct name, so screen readers don't run the label into the meaning.
            aria-label={`${RATINGS[rating].label}: ${RATINGS[rating].meaning}`}
            className={`pressable flex min-h-16 flex-col items-start gap-1 rounded-control p-3 text-left ${RATINGS[rating].tint}`}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-body font-bold">{RATINGS[rating].label}</span>
              <RecallMeter rating={rating} />
            </span>
            <span className="text-[0.875rem] leading-tight text-muted">{RATINGS[rating].meaning}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
