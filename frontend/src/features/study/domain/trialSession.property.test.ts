import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Rating } from './ratings';
import { rateTrial, startTrial, trialSummary } from './trialSession';

const RUNS = { seed: 20261116, numRuns: 300 };
const WINDOWS_SOONEST_FIRST = ['Tomorrow', 'In a few days', 'In a week or more'];

const rating = fc.constantFrom<Rating>('again', 'hard', 'good', 'easy');
const ratings = fc.array(rating, { maxLength: 12 });

describe('trial sessions, for generated rating sequences', () => {
  it('records one rating per card in order and refuses a rating after the last card', () => {
    fc.assert(
      fc.property(ratings, fc.integer({ min: 0, max: 12 }), (attempted, cardCount) => {
        let session = startTrial(cardCount);
        attempted.forEach((next, index) => {
          if (index >= cardCount) {
            expect(() => rateTrial(session, next)).toThrow();
            return;
          }
          session = rateTrial(session, next);
          expect(session.ratings).toEqual(attempted.slice(0, index + 1));
        });
      }),
      RUNS,
    );
  });

  it('lists every rated card exactly once, in groups ordered soonest first', () => {
    fc.assert(
      fc.property(ratings, (given) => {
        const cards = given.map((_, index) => index);
        const groups = trialSummary(cards, given);
        const listed = groups.flatMap((group) => group.cards.map(({ card }) => card));
        expect([...listed].sort((a, b) => a - b)).toEqual(cards);
        expect(groups.every((group) => group.cards.length > 0)).toBe(true);
        const shown = groups.map((group) => group.when);
        expect(shown).toEqual(WINDOWS_SOONEST_FIRST.filter((when) => shown.includes(when)));
      }),
      RUNS,
    );
  });
});
