import { test, expect } from './fixtures';

test('optional review details open without moving the card and close when the session pauses', async ({
  page,
}, info) => {
  const memoryTipText = 'Picture an arrow through a membrane.';
  const explanation = 'Water moves across the membrane.\n\n'.repeat(45).trim();
  const draft = 'This is my longer recall draft.\n\n'.repeat(20).trim();
  const card = {
    id: '23',
    question: 'What is osmosis?',
    answer: 'Water crosses a selectively permeable membrane.',
    explanation,
    memoryHook: memoryTipText,
    source: 'Biology notes: https://example.org/biology',
    setTitle: 'Biology review',
    publisherName: 'Revue',
    contentVersion: 1,
    version: 0,
  };
  let pauseSession = false;
  let resumeSession!: () => void;
  const sessionWait = new Promise<void>((resolve) => {
    resumeSession = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/me') {
      if (pauseSession) await sessionWait;
      return route.fulfill({ json: { username: 'focus_learner' } });
    }
    if (path.split('?')[0] === '/api/v1/cards/due')
      return route.fulfill({
        json: { totalCards: 1, availableCards: 1, dueCards: 1, newCards: 0, nextReviewDate: null, cards: [card] },
      });
    return route.fulfill({ status: 404 });
  });
  const cardFrame = page.locator('[data-card-frame]');
  const tip = page.getByRole('button', { name: 'Tip to remember', exact: true });
  const tipDialog = page.getByRole('dialog', { name: 'Tip to remember' });
  try {
    for (const [width, height, enlarged] of [
      [375, 667, false],
      [768, 900, false],
      [1366, 900, false],
      [844, 390, false],
      [320, 568, true],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: enlarged ? 'reduce' : 'no-preference' });
      await page.goto('/review/set-1');
      if (enlarged) await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      await page.getByRole('textbox', { name: 'Your answer (optional)' }).fill(draft);
      await expect(tip).toHaveCount(0);
      await page.getByRole('button', { name: 'Show answer' }).press('Enter');
      await expect(page.getByRole('heading', { name: card.answer, exact: true })).toBeFocused();
      await expect(page.getByText(memoryTipText, { exact: true })).not.toBeVisible();
      await expect(page.getByRole('link', { name: 'Biology notes' })).toHaveCount(0);
      await cardFrame.evaluate((element) =>
        Promise.allSettled(element.getAnimations().map((animation) => animation.finished)),
      );

      const ratings = page.locator('fieldset').filter({ hasText: 'Rate your answer' });
      const cardLayout = () =>
        Promise.all([
          cardFrame.evaluate((element) => element.clientHeight),
          ratings.evaluate((element) => element.getBoundingClientRect().top + window.scrollY),
        ]);
      const layout = await cardLayout();
      const placement = await page.evaluate(() => {
        const answerSide = document.querySelectorAll('[data-card-frame] > section')[1];
        const tipButton = [...answerSide.querySelectorAll('button')].find(
          (button) => button.textContent === 'Tip to remember',
        );
        const answerText = document.createRange();
        answerText.selectNodeContents(answerSide.querySelector('h2')!);
        const [faceBox, labelBox, answerBox, tipBox] = [
          answerSide,
          answerSide.querySelector('p'),
          answerText,
          tipButton,
        ].map((element) => element!.getBoundingClientRect());
        return {
          answerOffCenter: Math.abs(answerBox.left + answerBox.width / 2 - (faceBox.left + faceBox.width / 2)),
          tipOffLabel: Math.abs(tipBox.left - labelBox.left),
          tipBelowAnswer: tipBox.top >= answerBox.bottom,
          tipHeight: tipBox.height,
        };
      });
      expect(placement.answerOffCenter).toBeLessThanOrEqual(8);
      expect(placement.tipOffLabel).toBeLessThanOrEqual(1);
      expect(placement.tipBelowAnswer).toBe(true);
      expect(placement.tipHeight).toBeGreaterThanOrEqual(48);
      await tip.press('Enter');
      await expect(tipDialog.getByText(memoryTipText, { exact: true })).toBeVisible();
      expect(await cardLayout()).toEqual(layout);
      await page.keyboard.press('Escape');
      await expect(tip).toBeFocused();

      const compare = page.getByRole('button', { name: 'Compare with your answer' });
      const comparison = page.getByRole('dialog', { name: 'Compare with your answer' });
      await compare.press('Enter');
      await expect(comparison.getByText(card.answer, { exact: true })).toBeVisible();
      await expect(comparison.getByText(draft.split('\n')[0], { exact: false })).toBeVisible();
      await comparison.getByRole('button', { name: 'Done' }).press('Enter');
      await expect(compare).toBeFocused();

      const details = page.getByRole('dialog', { name: 'Explanation' });
      await page.getByRole('button', { name: 'Explanation' }).press('Enter');
      await expect(details.getByRole('link', { name: 'Biology notes' })).toHaveAttribute(
        'href',
        'https://example.org/biology',
      );
      await details.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(details.getByRole('button', { name: 'Done' })).toBeInViewport({ ratio: 1 });
      if (enlarged) {
        const titleFits = await details.getByRole('heading', { name: 'Explanation' }).evaluate((title) => {
          const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
          return title.getBoundingClientRect().height <= lineHeight * 2 + 1;
        });
        expect(titleFits).toBe(true);
        await page.screenshot({ path: info.outputPath('review-details-320-enlarged.png') });
      }
      await details.getByRole('button', { name: 'Done' }).press('Enter');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await cardLayout()).toEqual(layout);
      await page.screenshot({ path: info.outputPath(`compact-review-${width}.png`), fullPage: true });
    }

    await tip.press('Enter');
    await expect(tipDialog).toBeVisible();
    pauseSession = true;
    const sessionRequest = page.waitForRequest('**/api/v1/me');
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await sessionRequest;
    await expect(tipDialog).toHaveCount(0);
    resumeSession();
    await expect(tip).toBeFocused();
  } finally {
    resumeSession();
  }
});

test('small phones compact long answers so every rating fits, and larger screens keep the full size', async ({
  page,
}, info) => {
  const shared = {
    id: '23',
    memoryHook: 'A short tip.',
    explanation: 'A short explanation.',
    source: null,
    setTitle: 'Science quick review',
    publisherName: null,
    contentVersion: 1,
    version: 0,
  };
  const cards = {
    short: {
      ...shared,
      question: 'What does a plant need for photosynthesis?',
      answer: 'Light energy, water and carbon dioxide.',
    },
    long: {
      ...shared,
      question: 'What is osmosis?',
      answer: 'Water moving across a selectively permeable membrane from lower to higher solute concentration.',
    },
  };
  let card = cards.short;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/me') return route.fulfill({ json: { username: 'phone_learner' } });
    if (path.split('?')[0] === '/api/v1/cards/due')
      return route.fulfill({
        json: { totalCards: 1, availableCards: 1, dueCards: 1, newCards: 0, nextReviewDate: null, cards: [card] },
      });
    return route.fulfill({ status: 404 });
  });
  for (const { width, height, answer, fontSize, fitsScreen } of [
    { width: 375, height: 667, answer: 'short', fontSize: '28px', fitsScreen: true },
    { width: 375, height: 667, answer: 'long', fontSize: '20px', fitsScreen: true },
    { width: 360, height: 640, answer: 'short', fontSize: '28px', fitsScreen: true },
    { width: 360, height: 744, answer: 'long', fontSize: '28px', fitsScreen: false },
    { width: 768, height: 1024, answer: 'long', fontSize: '32px', fitsScreen: true },
  ] as const) {
    card = cards[answer];
    await page.setViewportSize({ width, height });
    await page.goto('/review/set-1');
    await page.getByRole('button', { name: 'Show answer' }).click();
    const heading = page.getByRole('heading', { name: card.answer, exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveCSS('font-size', fontSize);
    if (!fitsScreen) continue;
    await page
      .locator('[data-card-frame]')
      .evaluate((element) => Promise.allSettled(element.getAnimations().map((animation) => animation.finished)));
    const [tipBox, explanationBox] = await Promise.all(
      ['Tip to remember', 'Explanation'].map(async (name) => (await page.getByRole('button', { name }).boundingBox())!),
    );
    expect(explanationBox.y).toBeCloseTo(tipBox.y, 0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    for (const rating of [/^Missed:/, /^Hard:/, /^Good:/, /^Easy:/]) {
      await expect(page.getByRole('button', { name: rating })).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: info.outputPath(`review-${width}x${height}-${answer}.png`) });
  }
});

test('worst-case cards keep ratings near, read as paragraphs and open at their start', async ({ page }, info) => {
  const sentence = 'Water moves across the membrane toward the side with more dissolved particles. ';
  const shared = {
    id: '23',
    explanation: null,
    memoryHook: null,
    source: null,
    setTitle: 'Biology review',
    publisherName: null,
    contentVersion: 1,
    version: 0,
  };
  const longQuestion = sentence.repeat(6).trim();
  let card = { ...shared, question: longQuestion, answer: 'It swells and bursts.' };
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/me') return route.fulfill({ json: { username: 'worst_case_learner' } });
    if (path.split('?')[0] === '/api/v1/cards/due')
      return route.fulfill({
        json: { totalCards: 1, availableCards: 1, dueCards: 1, newCards: 0, nextReviewDate: null, cards: [card] },
      });
    return route.fulfill({ status: 404 });
  });
  const answerHeading = page.locator('[data-card-frame] > section').nth(1).locator('h2[tabindex="-1"]');

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/review/set-1');
  await page.getByRole('button', { name: 'Show answer' }).click();
  for (const rating of [/^Missed:/, /^Hard:/, /^Good:/, /^Easy:/]) {
    await expect(page.getByRole('button', { name: rating })).toBeInViewport({ ratio: 1 });
  }

  card = { ...shared, question: longQuestion, answer: sentence.repeat(12).trim() };
  for (const [width, height, fontSize] of [
    [320, 568, '18px'],
    [768, 1024, '20px'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/review/set-1');
    await page.getByRole('textbox', { name: 'Your answer (optional)' }).fill(sentence.repeat(20));
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(answerHeading).toBeFocused();
    await expect(answerHeading).toHaveCSS('text-align', 'left');
    await expect(answerHeading).toHaveCSS('font-size', fontSize);
    await expect(page.getByText('Answer', { exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`review-paragraph-${width}.png`) });
    await page.getByRole('button', { name: 'Back to question' }).click();
    const draft = page.getByRole('textbox', { name: 'Your answer', exact: true });
    await expect.poll(() => draft.evaluate((field) => field.scrollTop)).toBe(0);
  }

  card = { ...shared, question: '2 + 6?', answer: '8' };
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/review/set-1');
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expect(page.locator('[data-card-frame]')).toHaveCSS('min-height', '256px');
});

// Controlled API timing exercises browser focus and inert behavior in the production frontend.
for (const { cardCount, focusExit } of [
  { cardCount: 1, focusExit: false },
  { cardCount: 2, focusExit: false },
  { cardCount: 2, focusExit: true },
]) {
  const target = cardCount === 1 ? 'completion' : 'next question';
  test(`a rating finishing during session verification ${focusExit ? 'keeps focus on the chosen exit' : `focuses the ${target}`}`, async ({
    page,
  }) => {
    const card = {
      id: '23',
      question: 'First question',
      answer: 'First answer',
      explanation: null,
      memoryHook: null,
      source: '',
      setTitle: 'Study set',
      publisherName: 'Revue',
      contentVersion: 1,
      version: 0,
    };
    let saved = false;
    let checkSession = false;
    let releaseSession!: () => void;
    let releaseRating!: () => void;
    const sessionWait = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });
    const ratingWait = new Promise<void>((resolve) => {
      releaseRating = resolve;
    });
    let queueReads = 0;
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/me') {
        if (checkSession) await sessionWait;
        return route.fulfill({ json: { username: 'focus_learner' } });
      }
      if (path === '/api/v1/auth/csrf') {
        return route.fulfill({
          json: { token: 'test-form-token', headerName: 'X-XSRF-TOKEN', username: 'focus_learner' },
        });
      }
      if (path.split('?')[0] === '/api/v1/cards/due') {
        queueReads += 1;
        const cards = cardCount === 1 ? [card] : [card, { ...card, id: '24', question: 'Second question' }];
        return route.fulfill({
          json: {
            totalCards: cardCount,
            availableCards: cardCount,
            dueCards: 0,
            newCards: saved ? cardCount - 1 : cardCount,
            nextReviewDate: saved ? '2026-11-15' : null,
            cards: saved ? cards.slice(1) : cards,
            topics: [],
          },
        });
      }
      if (path === '/api/v1/reviews/23') {
        const input = route.request().postDataJSON();
        await ratingWait;
        saved = true;
        return route.fulfill({
          json: {
            cardId: card.id,
            requestId: input.requestId,
            scheduleVersion: 1,
            reviewedAt: '2026-11-14T00:00:00Z',
            recommendedReviewDate: '2026-11-15',
            nextReviewDate: '2026-11-15',
          },
        });
      }
      return route.fulfill({ status: 404 });
    });
    try {
      await page.goto('/review/set-1/start');
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
      await expect.poll(() => page.locator('h1').evaluate((element) => element.closest('[inert]') !== null)).toBe(true);
      releaseRating();
      const heading = page.locator('h2').filter({ hasText: cardCount === 1 ? '1 card reviewed' : 'Second question' });
      await expect(heading).toBeVisible();
      await expect(heading).not.toBeFocused();
      const exit = page.getByRole('link', { name: 'Revue', exact: true });
      if (focusExit) await exit.focus();
      releaseSession();
      await expect
        .poll(() => page.locator('h1').evaluate((element) => element.closest('[inert]') !== null))
        .toBe(false);
      await expect(focusExit ? exit : heading).toBeFocused();
      expect(queueReads).toBe(cardCount === 1 ? 3 : 1);
    } finally {
      releaseRating();
      releaseSession();
    }
  });
}
