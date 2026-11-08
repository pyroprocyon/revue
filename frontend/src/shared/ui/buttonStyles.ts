// Shared button looks. `pressable` (index.css) adds the hover, focus and pressed states.
const buttonBase =
  'pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 py-2 text-center text-body font-semibold disabled:cursor-not-allowed';

export const primaryButton = `${buttonBase} bg-accent text-on-accent disabled:bg-subtle disabled:text-muted`;

export const secondaryButton = `${buttonBase} bg-surface text-ink shadow-control`;

// A small pill that labels a card, such as "Sample card" or "Shared set". Not a control.
export const chip = 'inline-flex rounded-full bg-accent-soft px-3 py-1 text-label font-semibold text-accent-strong';

// Underlined text links, with the same focus ring as the buttons.
export const textLink =
  'rounded-sm text-accent underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
