import { useId } from 'react';
import { chip } from '../../../shared/ui/buttonStyles';
import { NextReviewPanel } from './NextReviewPanel';
import { RatingTag } from './ratings';

/**
 * An illustrative card built from the trial's own parts: the rating tag and the next-review
 * panel. Nothing in it is a control, and "Example schedule" says the interval is only an example,
 * because real intervals depend on each student's history.
 */
export function SampleCard() {
  const captionId = useId();
  return (
    <figure aria-labelledby={captionId} className="min-w-0 rounded-card bg-surface p-4 shadow-card sm:p-5 lg:p-8">
      <figcaption id={captionId} className={`${chip} max-lg:px-2 max-lg:py-0.5 lg:text-base`}>
        Sample card
      </figcaption>
      <p className="mt-2 text-section font-extrabold tracking-tight lg:mt-6 lg:text-[2.0625rem] lg:leading-[1.1] lg:tracking-[-0.01em]">
        Who wrote Noli Me Tangere?
      </p>
      <p className="mt-1 text-support lg:mt-6 lg:text-[1.875rem] lg:leading-[1.2]">José Rizal</p>
      <div className="mt-2 sm:mt-3 lg:mt-6 lg:text-[1.25rem]">
        <RatingTag rating="hard" />
      </div>
      <div className="mt-2 sm:mt-3 lg:mt-6">
        <NextReviewPanel label="Comes back" when="Tomorrow" note="Example schedule" />
      </div>
    </figure>
  );
}
