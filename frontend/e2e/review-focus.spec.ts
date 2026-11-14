import { test, expect } from './fixtures';

// Controlled API timing exercises browser focus and inert behavior in the production frontend.
for (const { cardCount, focusExit } of [
  { cardCount: 1, focusExit: false },
  { cardCount: 2, focusExit: false },
  { cardCount: 2, focusExit: true },
]) {
  const target = cardCount === 1 ? 'completion' : 'next question';
  test(`a rating finishing during session verification ${focusExit ? 'keeps focus on the chosen exit' : `focuses the ${target}`}`, async ({ page }) => {
    const card = {
      id: '23', question: 'First question', answer: 'First answer', explanation: null, memoryHook: null,
      source: '', keyIdeas: [], setTitle: 'Study set', publisherName: 'Revue', contentVersion: 1, version: 0,
    };
    let saved = false;
    let checkSession = false;
    let releaseSession!: () => void;
    let releaseRating!: () => void;
    const sessionWait = new Promise<void>((resolve) => { releaseSession = resolve; });
    const ratingWait = new Promise<void>((resolve) => { releaseRating = resolve; });
    let queueReads = 0;
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/me') {
        if (checkSession) await sessionWait;
        return route.fulfill({ json: { username: 'focus_learner' } });
      }
      if (path === '/api/v1/auth/csrf') {
        return route.fulfill({ json: { token: 'test-form-token', headerName: 'X-XSRF-TOKEN' } });
      }
      if (path === '/api/v1/cards/due') {
        queueReads += 1;
        const cards = cardCount === 1 ? [card] : [card, { ...card, id: '24', question: 'Second question' }];
        return route.fulfill({ json: {
          totalCards: cardCount, availableCards: cardCount, dueCards: 0, newCards: saved ? cardCount - 1 : cardCount,
          nextReviewDate: saved ? '2026-11-15' : null, cards: saved ? cards.slice(1) : cards,
        } });
      }
      if (path === '/api/v1/reviews/23') {
        const input = route.request().postDataJSON();
        await ratingWait;
        saved = true;
        return route.fulfill({ json: {
          cardId: card.id, requestId: input.requestId, scheduleVersion: 1, reviewedAt: '2026-11-14T00:00:00Z',
          recommendedReviewDate: '2026-11-15', nextReviewDate: '2026-11-15',
        } });
      }
      return route.fulfill({ status: 404 });
    });
    try {
      await page.goto('/review');
      await expect(page.getByRole('heading', { name: 'First question', exact: true })).toBeFocused();
      await page.getByRole('button', { name: 'Show answer' }).click();
      const ratingRequest = page.waitForRequest('**/api/v1/reviews/23');
      await page.getByRole('button', { name: /^Good:/ }).click();
      await ratingRequest;
      checkSession = true;
      const sessionRequest = page.waitForRequest('**/api/v1/me');
      await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      });
      await sessionRequest;
      await expect.poll(() => page.locator('h1').evaluate(element => element.closest('[inert]') !== null)).toBe(true);
      releaseRating();
      const heading = page.locator('h2').filter({ hasText: cardCount === 1 ? '1 card reviewed' : 'Second question' });
      await expect(heading).toBeVisible();
      await expect(heading).not.toBeFocused();
      const exit = page.getByRole('link', { name: 'Revue', exact: true });
      if (focusExit) await exit.focus();
      releaseSession();
      await expect.poll(() => page.locator('h1').evaluate(element => element.closest('[inert]') !== null)).toBe(false);
      await expect(focusExit ? exit : heading).toBeFocused();
      expect(queueReads).toBe(cardCount === 1 ? 2 : 1);
    } finally {
      releaseRating();
      releaseSession();
    }
  });
}
