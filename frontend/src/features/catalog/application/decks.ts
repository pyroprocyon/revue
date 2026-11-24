export type Deck = { id: string; title: string; cardCount: number; archived: boolean };
export type DeckCard = {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  memoryHook: string | null;
  source: string | null;
  contentVersion: number;
};
export type CardDraft = {
  question: string;
  answer: string;
  explanation: string;
  memoryHook: string;
  source: string;
};
/** The learner's review state for a deck. A paused deck has nothing due or new and no next date. */
export type DeckProgress = {
  dueCards: number;
  newCards: number;
  /** Missing while an older server answers, for example during a rollback, so the allowance is unknown. */
  newCardsLeftToday?: number;
  nextReviewDate: string | null;
};
export type DeckCardPage = {
  deck: Deck;
  progress: DeckProgress;
  items: DeckCard[];
  dueCardIds: string[];
  nextCursor: string | null;
};
export type DeckCardQuery = { after?: string; search?: string; dueOnly?: boolean };

/** The server enforces the same limits; the forms use them so a learner sees the limit while typing. */
export const DECK_TITLE_MAX_LENGTH = 50;
export const CARD_SEARCH_MAX_LENGTH = 200;
export const CARD_FIELD_MAX_LENGTH = {
  question: 500,
  answer: 500,
  explanation: 2000,
  memoryHook: 300,
  source: 500,
} as const satisfies Record<keyof CardDraft, number>;

export type DeckFailureReason =
  | 'signed-out'
  | 'expired-form'
  | 'not-found'
  | 'invalid'
  | 'deck-limit'
  | 'card-limit'
  | 'stale-card'
  | 'create-conflict'
  | 'outdated'
  | 'unknown';

export class DeckFailure extends Error {
  constructor(public readonly reason: DeckFailureReason) {
    super(reason);
  }
}

/** A learner's private decks and cards. Every result is confirmed by the server. */
export interface DeckGateway {
  prepareWrite(): void;
  list(): Promise<Deck[]>;
  create(title: string, requestId: string): Promise<Deck>;
  rename(deckId: string, title: string): Promise<Deck>;
  setArchived(deckId: string, archived: boolean): Promise<void>;
  remove(deckId: string): Promise<void>;
  cards(deckId: string, query: DeckCardQuery, signal?: AbortSignal): Promise<DeckCardPage>;
  addCard(deckId: string, draft: CardDraft, requestId: string): Promise<DeckCard>;
  editCard(cardId: string, draft: CardDraft, expectedVersion: number): Promise<DeckCard>;
  removeCard(cardId: string): Promise<void>;
}
