import { DeckFailure } from '../application/decks';

export const DECKS_UNAVAILABLE_TEXT = 'Decks aren’t available right now. They’re still saved, so try again later.';

/** True when a deck read reached a server older than this page, as during a backend rollback. */
export function decksUnavailable(error: unknown): boolean {
  return error instanceof DeckFailure && error.reason === 'outdated';
}
