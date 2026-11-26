import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';

async function signup(page: import('@playwright/test').Page, signupUrl: string) {
  await page.goto(signupUrl);
  await page.getByLabel('Username', { exact: true }).fill(`review_${randomUUID().slice(0, 16)}`);
  await page.getByLabel('Password', { exact: true }).fill('kanjii');
  await page.getByLabel('Confirm password', { exact: true }).fill('kanjii');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: 'No cards to review yet' })).toBeVisible();
}

async function savedSetReviewPath(page: import('@playwright/test').Page) {
  await page.goto('/library');
  await page.getByRole('link', { name: 'Open Published test set' }).click();
  const start = page.getByRole('link', { name: 'Start review: Published test set', exact: true });
  await expect(start).toBeVisible();
  return (await start.getAttribute('href'))!;
}

async function observeReviewFrame(page: import('@playwright/test').Page) {
  return page.locator('.review-card-frame').evaluateHandle((frame) => {
    const bounds = () => {
      const { x, y, width, height } = frame.getBoundingClientRect();
      return [x + scrollX, y + scrollY, width, height];
    };
    const initial = bounds();
    let changed: number[] | undefined;
    let animation = 0;
    function sample() {
      const current = bounds();
      if (!changed && current.some((value, index) => Math.abs(value - initial[index]) > 0.01)) changed = current;
      animation = requestAnimationFrame(sample);
    }
    sample();
    return () => {
      cancelAnimationFrame(animation);
      return { initial, final: changed ?? bounds() };
    };
  });
}

async function settledCardHeight(card: import('@playwright/test').Locator) {
  await card.evaluate((element) => Promise.allSettled(element.getAnimations().map((animation) => animation.finished)));
  await expect(card).not.toHaveAttribute('style', /height:/);
  return card.evaluate((element) => element.clientHeight);
}

test('saved review survives a lost response, exact retry, reload and removal', async ({ page, pilot }, info) => {
  pilot.addSaveableSet();
  await signup(page, pilot.signupUrl);
  await expect(page.getByRole('link', { name: 'Browse reviewers' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('today-empty.png'), fullPage: true });
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.getByRole('link', { name: 'Revue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No cards due today' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Library' }).click();
  await page.getByRole('link', { name: 'Open Published test set' }).click();
  await page.getByRole('link', { name: 'Start review: Published test set' }).click();
  await expect(page.getByRole('heading', { name: 'Test question', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Test answer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Rate your answer' })).toHaveCount(0);
  await page.getByText('Write an answer', { exact: false }).click();
  await page.getByLabel('Your answer (optional)').fill('private-browser-only-answer');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('heading', { name: 'Test answer', exact: true })).toBeFocused();
  const payloads: string[] = [];
  let lost = true;
  await page.route('**/api/v1/reviews/*', async (route) => {
    payloads.push(route.request().postData()!);
    const response = await route.fetch();
    if (lost) {
      lost = false;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Back to question' }).click();
  await expect(page.getByRole('heading', { name: 'Test question', exact: true })).toBeFocused();
  await page.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByRole('button', { name: 'Retry rating' })).toBeFocused();
  const queueRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/cards/due') queueRequests.push(request.url());
  });
  await page.clock.setFixedTime(new Date((await page.evaluate(() => Date.now())) + 30_000));
  const sessionRecheck = page.waitForResponse((response) => response.url().endsWith('/api/v1/me'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    Reflect.deleteProperty(document, 'visibilityState');
  });
  await sessionRecheck;
  expect(queueRequests).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Retry rating' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('review-unknown.png'), fullPage: true });
  await expect(page.getByText('1 card reviewed', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to answer' }).click();
  await expect(page.getByRole('button', { name: 'Retry rating' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to question' }).click();
  await expect(page.getByText('private-browser-only-answer', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry rating' }).click();
  await expect(page.getByRole('heading', { name: '1 card reviewed', exact: true })).toBeVisible();
  await expect(page.getByText('Review complete for Published test set', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('review-complete.png'), fullPage: true });
  await page.emulateMedia({ contrast: 'more' });
  await expect(page.locator('.review-completion-actions')).toHaveCSS('border-top-color', 'rgb(222, 226, 230)');
  await page.emulateMedia({ contrast: null });
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toBe(payloads[0]);
  expect(payloads[0]).not.toContain('private-browser-only-answer');
  await page.getByRole('link', { name: 'Back to Today', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nice work today!', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('link', { name: 'Open Published test set' }).click();
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  await page.getByRole('button', { name: 'Remove from Library: Published test set', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.getByRole('link', { name: 'Revue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nice work today!', exact: true })).toBeVisible();
});

test('Study rhythm sits above the review topics at every width', async ({ page, pilot }, info) => {
  const title = 'Cell transport and membrane transport mechanisms';
  await page.route('**/assets/*.woff2', (route) => route.abort('failed'));
  await signup(page, pilot.signupUrl);
  await page.route('**/api/v1/cards/due*', (route) =>
    route.fulfill({
      json: {
        topics: [
          { id: 'set-1', title: 'Science quick review', dueCards: 2 },
          { id: 'deck-1', title, dueCards: 7 },
          { id: 'deck-2', title: 'History', dueCards: 1 },
        ],
        continuation: new URL(route.request().url()).searchParams.has('pausedTopic')
          ? { topicTitle: 'Data structures and the algorithms that use them every day', dueCards: 0, newCards: 6 }
          : null,
        studyDays: Array.from({ length: 7 }, (_, index) => ({
          date: `2026-11-${11 + index}`,
          studied: [2, 4, 6].includes(index),
        })),
        cards: [],
        totalCards: 10,
        availableCards: 10,
        dueCards: 10,
        newCards: 0,
        nextReviewDate: null,
      },
    }),
  );
  await page.reload();
  const firstAction = page.getByRole('link', { name: 'Review 2 cards' });
  const studied = page.getByRole('heading', { name: '3 days studied' });
  const days = page.getByRole('list', { name: 'Recent study days' });
  const firstTopic = page.getByRole('heading', { name: 'Science quick review' });
  await expect(firstAction).toHaveAttribute('href', '/review/set-1');
  await expect(studied).toBeVisible();
  const next = page.getByRole('region', { name: 'Up next' });
  const otherTopics = next.getByText('Other topics', { exact: true });
  const choices = next.getByRole('list', { name: 'Review topics' });
  const nextSizes = new Map<number, { width: number; height: number }>();
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const topicBox = (await next.boundingBox())!;
    nextSizes.set(width, { width: topicBox.width, height: topicBox.height });
    const rhythmBox = (await page.getByRole('region', { name: 'Study rhythm' }).boundingBox())!;
    expect(rhythmBox.y + rhythmBox.height).toBeLessThanOrEqual(topicBox.y);
    await expect(firstTopic).toBeVisible();
    await firstAction.scrollIntoViewIfNeeded();
    await expect(firstAction).toBeInViewport({ ratio: 1 });
    await expect(days.locator('li')).toHaveCount(7);
    if (width === 768) {
      await otherTopics.press('Enter');
      await expect(choices.getByRole('button')).toHaveCount(2);
      await expect(choices.getByRole('button', { name: 'Science quick review' })).toHaveCount(0);
      const firstRow = (await choices.getByRole('button', { name: title }).boundingBox())!;
      const secondRow = (await choices.getByRole('button', { name: 'History' }).boundingBox())!;
      expect(firstRow.height).toBeGreaterThanOrEqual(48);
      expect(secondRow.y).toBeGreaterThanOrEqual(firstRow.y + firstRow.height);
      await otherTopics.press('Enter');
    }
    await page.screenshot({ path: info.outputPath(`study-rhythm-${width}.png`), fullPage: true });
  }
  const { username } = await (await page.request.get('/api/v1/me')).json();
  await page.evaluate((learner) => localStorage.setItem(`revue.paused-review.${learner}`, 'deck-3'), username);
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.reload();
    const continuation = page.getByRole('region', { name: 'Continue review' });
    await expect(continuation).toBeVisible();
    await expect(next).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const topicBox = (await next.boundingBox())!;
    expect({ width: topicBox.width, height: topicBox.height }).toEqual(nextSizes.get(width));
    const resume = (await continuation.getByRole('link', { name: 'Continue', exact: true }).boundingBox())!;
    const start = (await firstAction.boundingBox())!;
    expect({ width: start.width, height: start.height }).toEqual({ width: resume.width, height: resume.height });
    expect(start.height).toBe(48);
  }

  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const topic = page.getByRole('button', { name: title });
  const heading = page.getByRole('heading', { name: title });
  const start = page.getByRole('link', { name: 'Start with 5' });
  await expect(topic).toBeHidden();
  await otherTopics.press('Enter');
  await topic.press('Enter');
  await expect(topic).toHaveCount(0);
  await expect(choices.getByRole('button', { name: 'Science quick review' })).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(start).toBeFocused();
  await expect(start).toHaveAttribute('href', '/review/deck-1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: info.outputPath('study-rhythm-320-enlarged.png'), fullPage: true });
});

const withVisibleScrollbars = test.extend({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test('saved ratings follow the full typed answer on iPhone SE', async ({ page, pilot }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  pilot.addSaveableSet();
  await signup(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.goto(await savedSetReviewPath(page));
  await page.getByText('Write an answer', { exact: false }).click();
  const typedLines = [
    'I compile the code into bytecode.',
    'Then the JVM runs the bytecode.',
    'Each platform has its own JVM.',
  ];
  await page.getByRole('textbox', { name: 'Your answer (optional)' }).fill(typedLines.join('\n'));
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('heading', { name: 'Test answer', exact: true })).toBeFocused();
  const recap = page.getByText(typedLines.join(' '), { exact: true });
  const ratings = page.getByRole('group', { name: 'Rate your answer' });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect
    .poll(async () => {
      const [answer, group] = await Promise.all([recap.boundingBox(), ratings.boundingBox()]);
      return group!.y - (answer!.y + answer!.height);
    })
    .toBeGreaterThanOrEqual(0);
  await page.keyboard.press('End');
  await expect(recap).toBeInViewport({ ratio: 1 });
  await expect(ratings).toBeInViewport({ ratio: 1 });
  await ratings.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByRole('heading', { name: '1 card reviewed', exact: true })).toBeVisible();
  await expect(page.locator('.study-layout > header')).toBeHidden();
});

withVisibleScrollbars('Saved recall stays usable across widths and text sizes', async ({ page, pilot }, info) => {
  test.setTimeout(60_000);
  let ratings = 0;
  let started = false;
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/reviews/')) ratings += 1;
  });
  pilot.addSaveableSet();
  await signup(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  for (const [width, height, textSize] of [
    [375, 667, '100%'],
    [320, 568, '100%'],
    [390, 844, '100%'],
    [600, 535, '100%'],
    [690, 532, '100%'],
    [640, 900, '100%'],
    [768, 900, '100%'],
    [1024, 768, '100%'],
    [1366, 900, '100%'],
    [1920, 1080, '100%'],
    [844, 390, '100%'],
    [320, 568, '200%'],
    [375, 667, '200%'],
  ] as const) {
    await page.emulateMedia({ reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    await page.setViewportSize({ width, height });
    await page.goto('/today');
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, textSize);
    await expect(page.getByRole('heading', { name: started ? 'Continue review' : 'No cards due today' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your review', exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await expect(page.getByRole('link', { name: 'Revue', exact: true })).toHaveCount(width >= 640 ? 1 : 0);
    await page.screenshot({ path: info.outputPath(`today-${width}.png`), fullPage: true });
    if (started) {
      await page.getByRole('link', { name: 'Continue', exact: true }).click();
    } else {
      await page.getByRole('link', { name: 'Open Library' }).click();
      await page.getByRole('link', { name: 'Open Published test set' }).click();
      await page.getByRole('link', { name: 'Start review: Published test set' }).click();
      started = true;
    }
    await expect(page.getByRole('link', { name: 'Help', exact: true })).toHaveCount(0);
    await expect(page.getByRole('progressbar', { name: 'Batch progress' })).toHaveAttribute('value', '0');
    await expect(page.getByRole('heading', { name: 'Test question', exact: true })).toBeFocused();
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await expect(page.getByRole('link', { name: 'Revue', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Published test set', exact: true })).toBeVisible();
    const frame = await observeReviewFrame(page);
    await page.getByText('Write an answer', { exact: false }).click();
    await page.getByLabel('Your answer (optional)').fill('A draft kept when the viewport changes');
    const reveal = page.getByRole('button', { name: 'Show answer' });
    const missed = page.getByRole('button', { name: 'I don’t know', exact: true });
    if ((height >= 768 || width === 375) && textSize === '100%') await expect(reveal).toBeInViewport({ ratio: 1 });
    if (width <= 390) {
      await page.evaluate(() => document.fonts.ready);
      const [revealBounds, missedBounds] = await Promise.all([reveal.boundingBox(), missed.boundingBox()]);
      if (textSize === '100%') {
        expect(revealBounds!.height).toBe(48);
        expect(missedBounds!.height).toBe(48);
        expect(missedBounds!.y).toBe(revealBounds!.y);
        if (width === 375) await expect(missed).toBeInViewport({ ratio: 1 });
      } else {
        expect(missedBounds!.y).toBeGreaterThanOrEqual(revealBounds!.y + revealBounds!.height);
      }
    }
    await page.screenshot({
      path: info.outputPath(`review-front-${width}.png`),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Show answer' }).focus();
    await page.keyboard.press('Enter');
    const rotatingCard = page.locator('[data-card-frame]');
    const flipMs = width >= 640 ? 480 : 360;
    await expect(rotatingCard).toHaveCSS('transition-duration', width === 320 ? '0s' : `${flipMs / 1000}s`);
    await expect(page.locator('.animate-review-actions-in')).toHaveCSS(
      'animation-duration',
      width === 320 ? '0s' : `${flipMs / 2000}s`,
    );
    const revealedHeight = await settledCardHeight(rotatingCard);
    await expect(page.getByRole('heading', { name: 'Test answer', exact: true })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Test question', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('paragraph').filter({ hasText: 'A draft kept when the viewport changes' }),
    ).toBeVisible();
    const recapLabel = page.getByText('Your answer', { exact: true });
    await expect(recapLabel).toHaveCSS('color', 'rgb(24, 100, 171)');
    const recapBeforeFlip = await recapLabel.elementHandle();
    await expect(page.getByRole('button', { name: /^Good:/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const ratings = page.getByRole('group', { name: 'Rate your answer' });
    const ratingsBeforeFlip = await ratings.elementHandle();
    const ratingButtons = ratings.locator('button');
    if ([768, 1024, 1366].includes(width)) {
      const [bounds, first, last] = await Promise.all([
        ratings.boundingBox(),
        ratingButtons.first().boundingBox(),
        ratingButtons.last().boundingBox(),
      ]);
      if (bounds!.width >= 38 * 16) {
        expect(last!.y).toBe(first!.y);
      } else {
        expect(last!.y).toBeGreaterThan(first!.y);
      }
    }
    await page.screenshot({ path: info.outputPath(`review-${width}.png`) });
    for (const name of [/^Good:/, /^Missed:/, /^Hard:/, /^Easy:/]) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(48);
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }
    const backToQuestion = page.getByRole('button', { name: 'Back to question' });
    await backToQuestion.focus();
    await expect(backToQuestion).toHaveCSS('outline-style', 'solid');
    await expect(backToQuestion).toHaveCSS('outline-color', 'rgb(24, 100, 171)');
    await backToQuestion.press('Enter');
    await expect(page.getByRole('heading', { name: 'Test question', exact: true })).toBeFocused();
    expect(await recapBeforeFlip.evaluate((label) => label.isConnected)).toBe(true);
    await expect(recapLabel).toBeVisible();
    expect(await ratingsBeforeFlip.evaluate((group) => group.isConnected)).toBe(true);
    await expect(ratings).toBeVisible();
    await expect(page.getByText('A draft kept when the viewport changes', { exact: true })).toBeVisible();
    await expect(recapLabel).toHaveCSS('color', 'rgb(24, 100, 171)');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    expect(await settledCardHeight(rotatingCard)).toBe(revealedHeight);
    const backToAnswer = page.getByRole('button', { name: 'Back to answer' });
    await backToAnswer.focus();
    await expect(backToAnswer).toHaveCSS('outline-style', 'solid');
    await expect(backToAnswer).toHaveCSS('outline-color', 'rgb(47, 42, 138)');
    await backToAnswer.press('Space');
    await expect(page.getByRole('heading', { name: 'Test answer', exact: true })).toBeFocused();
    expect(await recapBeforeFlip.evaluate((label) => label.isConnected)).toBe(true);
    await expect(recapLabel).toBeVisible();
    await recapBeforeFlip.dispose();
    expect(await ratingsBeforeFlip.evaluate((group) => group.isConnected)).toBe(true);
    await expect(ratings).toBeVisible();
    await ratingsBeforeFlip.dispose();
    expect(await settledCardHeight(rotatingCard)).toBe(revealedHeight);
    const measured = await frame.evaluate((stop) => stop());
    expect(measured.final, `card frame at ${width} × ${height} / ${textSize}`).toEqual(measured.initial);
    await frame.dispose();
    await expect(page.getByRole('progressbar', { name: 'Batch progress' })).toHaveAttribute('value', '0');
  }
  expect(ratings).toBe(0);
  await page.getByRole('link', { name: 'Finish for now' }).click();
  await expect(page.getByRole('link', { name: 'Continue', exact: true })).toBeVisible();
});

test('review session checks stay quiet and preserve the layout on iPhone SE', async ({ page, pilot }, info) => {
  pilot.addSaveableSet();
  await signup(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.goto(await savedSetReviewPath(page));
  await page.getByText('Write an answer', { exact: false }).click();
  await page.getByLabel('Your answer (optional)').fill('Keep my answer while checking the session');

  for (const [width, height, textSize] of [
    [375, 667, '100%'],
    [320, 568, '100%'],
    [375, 667, '200%'],
    [667, 375, '100%'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, textSize);
    const frame = page.locator('.review-card-frame');
    const before = await frame.boundingBox();
    let resume!: () => void;
    const pending = new Promise<void>((resolve) => {
      resume = resolve;
    });
    await page.route('**/api/v1/me', async (route) => {
      await pending;
      await route.continue();
    });
    try {
      await page.clock.setFixedTime(new Date((await page.evaluate(() => Date.now())) + 30_000));
      const recheck = page.waitForRequest((request) => request.url().endsWith('/api/v1/me'));
      await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      });
      await recheck;
      await expect(page.getByText('Checking session…', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Finish for now' })).toBeVisible();
      expect(await frame.boundingBox()).toEqual(before);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: info.outputPath(`session-check-${width}-${textSize}.png`), fullPage: true });
    } finally {
      const response = page.waitForResponse((result) => result.url().endsWith('/api/v1/me'));
      resume();
      await response;
      await page.unroute('**/api/v1/me');
    }
    await expect(page.getByLabel('Your answer (optional)')).toHaveValue('Keep my answer while checking the session');
  }
});

test('a stale tab refreshes after another tab saves without claiming a second review', async ({
  page,
  context,
  pilot,
}) => {
  pilot.addSaveableSet();
  await signup(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  const reviewPath = await savedSetReviewPath(page);
  await page.goto(reviewPath);
  await page.getByRole('button', { name: 'Show answer' }).click();
  const second = await context.newPage();
  await second.goto(`${pilot.origin}${reviewPath}`);
  await second.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByRole('heading', { name: '1 card reviewed', exact: true })).toBeFocused();
  await second.getByRole('button', { name: /^Hard:/ }).click();
  await expect(second.getByRole('status')).toContainText('another tab');
  await expect(second.getByRole('heading', { name: '0 cards reviewed', exact: true })).toBeFocused();
  await expect(second.getByText('Review complete for Published test set', { exact: true })).toBeVisible();
  await second.getByRole('link', { name: 'Back to Today' }).click();
  await expect(second.getByRole('heading', { name: 'Nice work today!', exact: true })).toBeVisible();
});

test('Today resumes a fresh review after Finish for now and a reload', async ({ page, pilot }, info) => {
  pilot.addSaveableSet();
  await signup(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.goto(await savedSetReviewPath(page));
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
  await page.getByRole('link', { name: 'Finish for now' }).click();
  const continuation = page.getByRole('link', { name: 'Continue', exact: true });
  await expect(continuation).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No cards due today' })).toHaveCount(0);
  await page.reload();
  await expect(continuation).toBeVisible();
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 800 });
    await page.screenshot({ path: info.outputPath(`continue-review-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const enlarged = await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(continuation).toBeVisible();
  await continuation.scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Published test set' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('continue-review-enlarged.png'), fullPage: true });
  await enlarged.evaluate((element) => element.parentNode?.removeChild(element));
  await continuation.focus();
  await expect(continuation).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByRole('heading', { name: '1 card reviewed', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Nice work today!' })).toBeVisible();
  await expect(continuation).toHaveCount(0);
});

test('Today refreshes the open page when the Manila study day changes', async ({ page, pilot }) => {
  await signup(page, pilot.signupUrl);
  await page.clock.install({ time: new Date('2026-12-31T15:55:00Z') });
  let newDay = false;
  await page.route('**/api/v1/cards/due*', (route) =>
    route.fulfill({
      json: {
        totalCards: 2,
        availableCards: 2,
        dueCards: newDay ? 2 : 0,
        newCards: 0,
        cards: [],
        topics: newDay ? [{ id: 'deck-1', title: 'Geography', dueCards: 2 }] : [],
        studyDays: [],
        nextReviewDate: '2027-01-01',
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'All caught up' })).toBeVisible();
  await page.clock.fastForward('04:00');
  await expect(page.getByRole('heading', { name: 'All caught up' })).toBeVisible();
  newDay = true;
  await page.clock.fastForward('01:05');
  await expect(page.getByRole('link', { name: 'Review 2 cards' })).toBeVisible();
});
