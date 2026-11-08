import { describe, expect, it } from 'vitest';
import { rateTrial, startTrial, trialSummary } from './trialSession';

describe('unsaved trial', () => {
  it('records one rating without changing the earlier session', () => {
    const initial = startTrial(2);
    const next = rateTrial(initial, 'again');
    expect(initial.ratings).toEqual([]);
    expect(next.ratings).toEqual(['again']);
    expect(next.cardCount).toBe(2);
  });

  it('cannot add another rating after its final card', () => {
    const complete = rateTrial(startTrial(1), 'good');
    expect(() => rateTrial(complete, 'easy')).toThrow('already finished');
  });

  it('keeps card-rating pairs and within-group order while showing earlier example timing first', () => {
    const groups = trialSummary(['A', 'B', 'C', 'D'], ['easy', 'hard', 'good', 'again']);
    expect(groups).toEqual([
      { when: 'Tomorrow', cards: [{ card: 'B', rating: 'hard' }, { card: 'D', rating: 'again' }] },
      { when: 'In a few days', cards: [{ card: 'C', rating: 'good' }] },
      { when: 'In a week or more', cards: [{ card: 'A', rating: 'easy' }] },
    ]);
  });

  it('omits empty timing groups', () => {
    expect(trialSummary(['A'], ['easy'])).toEqual([
      { when: 'In a week or more', cards: [{ card: 'A', rating: 'easy' }] },
    ]);
  });
});
