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
export type DemoCard = {
  key: string;
  question: string;
  answer: string;
  /** A short note under the answer, when the card's author wrote one. */
  explanation: string | null;
  source: string | null;
};

export type DemoCards = {
  setTitle: string;
  publisherName: string;
  cards: DemoCard[];
};

/** The UI supplies this read port; HTTP belongs to the infrastructure adapter. */
export interface PublicContentReader {
  list(): Promise<PublicSet[]>;
  sharedSummary(code: string): Promise<PublicSet | null>;
  summary(setKey: string): Promise<PublicSet | null>;
  demoCards(setKey: string): Promise<DemoCards | null>;
}
