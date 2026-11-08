import type { Rating } from './ratings';

/** Browser-only practice. These ratings are never scheduled reviews. */
export type TrialSession = {
  readonly cardCount: number;
  readonly ratings: readonly Rating[];
};

export function startTrial(cardCount: number): TrialSession {
  return { cardCount, ratings: [] };
}

export function rateTrial(session: TrialSession, rating: Rating): TrialSession {
  if (session.ratings.length >= session.cardCount) {
    throw new Error('The trial is already finished');
  }
  return { ...session, ratings: [...session.ratings, rating] };
}

const EXAMPLE_WINDOWS: { when: string; ratings: readonly Rating[] }[] = [
  { when: 'Tomorrow', ratings: ['again', 'hard'] },
  { when: 'In a few days', ratings: ['good'] },
  { when: 'In a week or more', ratings: ['easy'] },
];

/** Illustrative timing for the unsaved trial, never actual FSRS dates. */
export function trialSummary<Card>(cards: readonly Card[], ratings: readonly Rating[]) {
  const ratedCards = cards.map((card, index) => ({ card, rating: ratings[index] }));
  return EXAMPLE_WINDOWS.map((window) => ({
    when: window.when,
    cards: ratedCards.filter(({ rating }) => window.ratings.includes(rating)),
  })).filter((group) => group.cards.length > 0);
}
