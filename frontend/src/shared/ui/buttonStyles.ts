// Shared button looks. `pressable` (index.css) adds the hover, focus and pressed states.
const buttonBase =
  'pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 py-2 text-center text-body font-semibold disabled:cursor-not-allowed';

export const primaryButton = `${buttonBase} accent-control-gradient bg-accent text-on-accent disabled:bg-subtle disabled:text-muted`;

export const blueAccentButton = `${buttonBase} accent-control-gradient bg-saved-set text-on-saved-set disabled:bg-subtle disabled:text-muted`;

export const secondaryButton = `${buttonBase} neutral-control-gradient bg-surface text-ink shadow-control`;

const outlineButton =
  'pressable neutral-control-gradient inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-control border bg-surface px-4 py-2 text-center text-label wrap-anywhere';

export const neutralOutlineButton = `${outlineButton} border-line font-semibold text-ink`;

export const destructiveOutlineButton = `${outlineButton} border-destructive-edge font-bold text-destructive`;

export const inlineConfirmationButton = 'min-w-0 flex-[1_1_7rem] max-sm:px-3';

const accountControl =
  'pressable inline-flex min-h-12 min-w-12 items-center justify-center rounded-control py-2 text-center font-semibold';

export const accountLink = `${accountControl} px-3 text-label text-accent`;

// The phone pair shares available width. Desktop buttons fit their labels.
const accountButton = `${accountControl} flex-1 basis-32 border px-2 text-base/5 lg:flex-none lg:px-4`;
export const accountOutlinedButton = `${accountButton} neutral-control-gradient border-accent/30 bg-surface text-accent`;
export const accountTonalButton = `${accountButton} tonal-control-gradient border-transparent bg-accent-soft text-accent-strong`;

// A small pill that labels a card, such as "Sample card" or "Shared set". Not a control.
export const chip = 'inline-flex rounded-full bg-accent-soft px-3 py-1 text-label font-semibold text-accent-strong';

// Underlined text links, with the same focus ring as the buttons.
export const textLink =
  'rounded-sm text-accent underline decoration-1 decoration-accent/60 underline-offset-3 hover:decoration-accent focus-visible:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:text-accent-strong';

export const textLinkTarget =
  'inline-grid min-h-12 min-w-12 max-w-full place-items-center px-2 align-middle wrap-anywhere';
