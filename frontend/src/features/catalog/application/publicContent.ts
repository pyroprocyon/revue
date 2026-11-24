export type PublicSet = {
  setKey: string;
  shareCode: string;
  title: string;
  description: string;
  publisherName: string;
  subject?: string;
  cardCount: number;
  trialAvailable: boolean;
  saveAllowed: boolean;
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
export type ReviewerSubject = { subject: string; topicCount: number };

/** The server limits concurrent public catalog reads and answers an extra one with 503 and Retry-After: 1. */
export class PublicCatalogBusy extends Error {
  constructor() {
    super('The public catalog is busy');
  }
}

/** Application read port; App supplies its HTTP implementation to the screens. */
export interface PublicContentReader {
  onboarding(signal: AbortSignal): Promise<PublicSet[]>;
  topics(subject: string, search: string, after: string | undefined, signal: AbortSignal): Promise<PublicSetPage>;
  subjects(signal: AbortSignal): Promise<ReviewerSubject[]>;
  sharedSummary(code: string): Promise<PublicSet | null>;
  summary(setKey: string): Promise<PublicSet | null>;
  trialCards(setKey: string): Promise<TrialCards | null>;
}
