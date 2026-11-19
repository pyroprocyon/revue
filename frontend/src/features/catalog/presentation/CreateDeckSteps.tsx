import { Check } from 'lucide-react';

const STEPS = ['Deck', 'Cards'];

export function CreateDeckSteps({ current }: Readonly<{ current: 1 | 2 }>) {
  return (
    <ol aria-label="Steps" className="mb-3 grid max-w-lg grid-cols-2 gap-1.5 sm:mb-4">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        return (
          <li
            key={label}
            aria-current={step === current ? 'step' : undefined}
            className="grid gap-1.5 text-support font-bold text-muted aria-[current=step]:text-accent-strong"
          >
            <span aria-hidden="true" className={`h-1.5 rounded-full ${step <= current ? 'bg-accent' : 'bg-subtle'}`} />
            <span className="flex items-center gap-1">
              {done && <Check aria-hidden="true" className="size-4 shrink-0 text-good" />}
              {label}
              {done && <span className="sr-only">, done</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
