import type { KeyboardEvent } from 'react';

export const ROW_SELECTION_HINT = 'Use the up and down arrow keys to choose another card.';

// On wide screens a card list is one Tab stop, so Tab reaches the side pane next; arrow keys choose the card.
const rowKeys: Record<string, (current: number, last: number) => number> = {
  ArrowDown: (current, last) => Math.min(current + 1, last),
  ArrowUp: (current) => Math.max(current - 1, 0),
  Home: () => 0,
  End: (_current, last) => last,
};

export function moveRowSelection(event: KeyboardEvent<HTMLButtonElement>) {
  const move = rowKeys[event.key];
  const list = event.currentTarget.closest('ul, ol');
  if (!move || !list) return;
  const rows = [...list.querySelectorAll<HTMLButtonElement>('[data-card-row]')];
  const current = rows.indexOf(event.currentTarget);
  event.preventDefault();
  const next = rows[move(current, rows.length - 1)];
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest' });
  next.click();
}
