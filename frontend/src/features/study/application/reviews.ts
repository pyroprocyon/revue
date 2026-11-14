export type StudyCard = {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  memoryHook: string | null;
  source: string;
  keyIdeas: string[];
  setTitle: string;
  publisherName: string;
  contentVersion: number;
  version: number;
};
export type StudyQueue = {
  totalCards: number;
  availableCards: number;
  dueCards: number;
  newCards: number;
  nextReviewDate: string | null;
  cards: StudyCard[];
};
export type RatingRequest = {
  rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
  attemptMode: 'ANSWERED' | 'SHOWN';
  requestId: string;
  expectedVersion: number;
  contentVersion: number;
};
export type ReviewResult = {
  cardId: string;
  requestId: string;
  reviewedAt: string;
  recommendedReviewDate: string;
  nextReviewDate: string;
  scheduleVersion: number;
};
export interface ReviewGateway {
  queue(): Promise<StudyQueue>;
  rate(cardId: string, input: RatingRequest): Promise<ReviewResult>;
}
export class ReviewFailure extends Error {
  constructor(
    readonly kind: 'signed-out' | 'expired-form' | 'unavailable' | 'conflict' | 'invalid' | 'unknown',
    readonly reason = '',
  ) {
    super(kind);
  }
}
