/** The study action already shows the due count, so the filter labels leave it out. */
export function DueFilter({ dueOnly, onChange }: Readonly<{ dueOnly: boolean; onChange: (dueOnly: boolean) => void }>) {
  const option = (label: string, isDue: boolean) => (
    <button
      type="button"
      aria-pressed={dueOnly === isDue}
      onClick={() => onChange(isDue)}
      className={`pressable flex min-h-12 min-w-0 items-center justify-center border-b-2 border-transparent px-2 text-center text-label leading-tight font-bold wrap-anywhere aria-pressed:border-accent ${isDue ? 'text-due' : 'text-muted aria-pressed:text-accent-strong'}`}
    >
      {label}
    </button>
  );
  return (
    <fieldset className="mb-3 grid w-51 max-w-full min-w-0 grid-cols-2 gap-1 border-b border-line">
      <legend className="sr-only">Show cards</legend>
      {option('All cards', false)}
      {option('Due', true)}
    </fieldset>
  );
}
