export type PublicSet = {
  setKey: string;
  shareCode: string;
  title: string;
  description: string;
  publisherName: string;
  cardCount: number;
  trialAvailable: boolean;
};

/** A flashcard: the question on the front, the answer and its optional note and source on the back. */
export type TrialCard = {
  key: string;
  question: string;
  answer: string;
  /** A short note under the answer, when the card's author wrote one. */
  explanation: string | null;
  source: string | null;
};

export type TrialCards = {
  setTitle: string;
  publisherName: string;
  cards: TrialCard[];
};

export type PublicSetPage = { items: PublicSet[]; nextCursor: string | null };

/** Application read port; App supplies its HTTP implementation to the screens. */
export interface PublicContentReader {
  list(after?: string): Promise<PublicSetPage>;
  sharedSummary(code: string): Promise<PublicSet | null>;
  summary(setKey: string): Promise<PublicSet | null>;
  trialCards(setKey: string): Promise<TrialCards | null>;
}
