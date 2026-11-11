import { Brain, CalendarClock, ClipboardCheck } from 'lucide-react';

export const REVIEW_STEPS_TITLE = 'How spaced repetition works';
export const REVIEW_STEPS_INTRO = 'You revisit cards after a break. Your rating helps decide how long to wait.';

const REVIEW_STEPS = [
  { icon: Brain, title: 'Answer from memory.', text: 'Give yourself a moment before turning the card.' },
  { icon: ClipboardCheck, title: 'Check and rate.', text: 'Base your rating on whether you got it right and how much effort it took.' },
  { icon: CalendarClock, title: 'Practice again later.', text: 'A tough card might come back tomorrow. One you know well can wait longer.' },
];

/**
 * Shared explanation for the mobile page and desktop landing. The parent container
 * sets whether the steps stack or sit side by side.
 */
export function ReviewSteps() {
  return (
    <ol className="grid gap-6 @2xl:grid-cols-3 @2xl:gap-8">
      {REVIEW_STEPS.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex min-w-0 gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"
          >
            <Icon className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-section leading-tight font-extrabold tracking-tight text-balance @2xl:text-[1.6875rem]">
              {title}
            </p>
            <p className="mt-1 text-body text-muted @2xl:text-[1.1875rem]">{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
