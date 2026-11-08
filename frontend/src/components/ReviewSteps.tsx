const REVIEW_STEPS = [
  { title: 'Try to remember.', text: 'Think of the answer before you flip the card.' },
  { title: 'Check your answer.', text: 'Flip the card, then rate how well you remembered.' },
  { title: 'See it again when it’s due.', text: 'Revue schedules when each card comes back.' },
];

/**
 * The landing page's three numbered steps and the line that names spaced repetition. The parent
 * needs Tailwind's `@container` class: the steps stack on phones and sit side by side, with larger
 * type, in the wide desktop section.
 */
export function ReviewSteps() {
  return (
    <div>
      <ol className="grid gap-6 @2xl:grid-cols-3 @2xl:gap-8">
        {REVIEW_STEPS.map((step, index) => (
          <li key={step.title} className="flex min-w-0 gap-4">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-control bg-accent-soft text-section font-bold text-accent tabular-nums"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <p className="text-section leading-tight font-extrabold tracking-tight text-balance @2xl:text-[1.6875rem]">
                {step.title}
              </p>
              <p className="mt-1 text-body text-muted @2xl:text-[1.1875rem]">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-body @2xl:text-[1.1875rem]">
        As you remember more reliably, the gaps between practice grow longer. That’s spaced repetition.
      </p>
    </div>
  );
}
