export type StudyCard = {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  memoryHook: string | null;
  source: string | null;
  setTitle: string;
  publisherName: string | null;
  contentVersion: number;
  version: number;
};
export type ReviewTopic = { id: string; title: string; dueCards: number };
export type StudyDay = { date: string; studied: boolean };
export type ReviewSelection = { topic: string; includeNew: boolean };

export type StudyQueue = {
  totalCards: number;
  availableCards: number;
  dueCards: number;
  newCards: number;
  nextReviewDate: string | null;
  cards: StudyCard[];
  topics?: ReviewTopic[];
  continuation?: Pick<StudyQueue, 'topicTitle' | 'dueCards' | 'newCards' | 'unintroducedCards'> | null;
  studyDays?: readonly StudyDay[];
  topicTitle?: string | null;
  unintroducedCards?: number;
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
  queue(selection?: ReviewSelection, summaryOnly?: boolean, pausedTopic?: string): Promise<StudyQueue>;
  rate(cardId: string, input: RatingRequest): Promise<ReviewResult>;
}
export class ReviewFailure extends Error {
  constructor(
    readonly kind: 'signed-out' | 'expired-form' | 'unavailable' | 'conflict' | 'invalid' | 'unknown',
    readonly reason = '',
    readonly currentCard?: StudyCard,
  ) {
    super(kind);
  }
}
