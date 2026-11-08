export type Rating = 'again' | 'hard' | 'good' | 'easy';

export const RATING_MEANINGS = {
  again: { label: 'Missed', meaning: 'Wrong or a guess', level: 1 },
  hard: { label: 'Hard', meaning: 'Right, with effort', level: 2 },
  good: { label: 'Good', meaning: 'Right, with a pause', level: 3 },
  easy: { label: 'Easy', meaning: 'Right, instantly', level: 4 },
} as const;
