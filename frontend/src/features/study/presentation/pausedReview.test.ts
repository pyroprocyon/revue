import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetReview, pausedReview, rememberReview } from './pausedReview';

const key = 'revue.paused-review.learner';
const storageFull = () => {
  throw new DOMException('Storage is full', 'QuotaExceededError');
};

describe('paused review', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rememberReview('learner', 'set-1');
    forgetReview('learner', 'set-1');
  });

  it('keeps the latest topic when storage refuses the write but still reads an older one', () => {
    rememberReview('learner', 'set-1');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(storageFull);

    rememberReview('learner', 'deck-2');

    expect(localStorage.getItem(key)).toBe('set-1');
    expect(pausedReview('learner')).toBe('deck-2');
    expect(pausedReview('someone-else')).toBeNull();
  });

  it('reads storage again once a write succeeds, so another tab’s change shows', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(storageFull);
    rememberReview('learner', 'deck-2');
    rememberReview('learner', 'set-1');

    localStorage.setItem(key, 'set-3');

    expect(pausedReview('learner')).toBe('set-3');
  });

  it('forgets a topic even when storage refuses to remove it', () => {
    rememberReview('learner', 'set-1');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(storageFull);

    forgetReview('learner', 'set-1');

    expect(localStorage.getItem(key)).toBe('set-1');
    expect(pausedReview('learner')).toBeNull();
  });
});
