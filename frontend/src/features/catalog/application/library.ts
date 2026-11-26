import type { DeckCardPage, DeckCardQuery } from './decks';

export type SavedSet = {
  id: string;
  setKey: string;
  title: string;
  description: string;
  publisherName: string;
  cardCount: number;
  retired: boolean;
  saveAllowed: boolean;
  reviewsPaused?: boolean;
  savedAt: string;
};
export type ReviewGroup = 'active' | 'paused';
export type ReviewCounts = Record<ReviewGroup, number>;
export type LibraryPage = { items: SavedSet[]; nextCursor: string | null; counts?: ReviewCounts };
export const SAVED_SET_LIMIT = 50;
export type LibraryFailureReason =
  'signed-out' | 'unavailable' | 'expired-form' | 'unknown' | 'load' | 'saved-set-limit';

export class LibraryFailure extends Error {
  constructor(public readonly reason: LibraryFailureReason) {
    super(reason);
  }
}

/** Only confirmed server state belongs in the saved library. null membership means signed out. */
export interface LibraryGateway {
  membership: (id: string) => Promise<boolean | null>;
  save: (id: string) => Promise<SavedSet>;
  remove: (id: string) => Promise<void>;
  setReviewsPaused: (id: string, paused: boolean) => Promise<void>;
  list: (after?: string, group?: ReviewGroup, signal?: AbortSignal) => Promise<LibraryPage>;
  savedKeys: (signal: AbortSignal) => Promise<string[]>;
  detail: (id: string) => Promise<SavedSet>;
  cards: (setId: string, query: DeckCardQuery, signal?: AbortSignal) => Promise<DeckCardPage>;
}

/** Share identifiers are base 36; BigInt preserves the database's full bigint identifier. */
export function sharedSetId(code: string): string {
  if (!/^[1-9a-z][0-9a-z]*$/.test(code)) throw new Error('Invalid shared set identifier');
  return code
    .split('')
    .reduce((value, digit) => value * 36n + BigInt(Number.parseInt(digit, 36)), 0n)
    .toString();
}
