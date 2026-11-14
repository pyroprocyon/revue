import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';

async function signup(page: import('@playwright/test').Page, invitation: string) {
  await page.goto(invitation);
  await page.getByLabel('Username', { exact: true }).fill(`review_${randomUUID().slice(0, 16)}`);
  await page.getByLabel('Password', { exact: true }).fill('kanjii');
  await page.getByLabel('Confirm password', { exact: true }).fill('kanjii');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: 'No cards to review yet' })).toBeVisible();
}

async function brandBounds(page: import('@playwright/test').Page) {
  return page.getByRole('link', { name: 'Revue', exact: true }).evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    // Route-entry focus can scroll long pages. Compare positions within the document.
    return { x: x + window.scrollX, y: y + window.scrollY, width, height };
  });
}

test('saved review survives a lost response, exact retry, reload and removal', async ({ page, pilot }, info) => {
  pilot.addSaveableSet();
  await signup(page, pilot.invitation());
  await expect(page.getByRole('link', { name: 'Browse sets' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('today-empty.png'), fullPage: true });
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.getByRole('link', { name: 'Revue', exact: true }).click();
  await page.getByRole('link', { name: 'Review 1 card', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test question', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Test answer', exact: true })).toHaveCount(0);
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
  await page.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByRole('button', { name: 'Retry rating' })).toBeVisible();
  let failedRefreshes = 0;
  await page.route('**/api/v1/cards/due', async (route) => {
    failedRefreshes += 1;
    await route.fulfill({ status: 503, json: {} });
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    Reflect.deleteProperty(document, 'visibilityState');
  });
  await expect.poll(() => failedRefreshes).toBe(1);
  await expect(page.getByRole('button', { name: 'Retry rating' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('review-unknown.png'), fullPage: true });
  await expect(page.getByText('1 card reviewed', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to question' }).click();
  await expect(page.getByLabel('Your answer (optional)')).toHaveValue('private-browser-only-answer');
  await page.getByRole('button', { name: 'Back to answer' }).click();
  await page.unroute('**/api/v1/cards/due');
  await page.getByRole('button', { name: 'Retry rating' }).click();
  await expect(page.getByRole('heading', { name: '1 card reviewed', exact: true })).toBeVisible();
  await expect(page.getByText('All caught up.', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('review-complete.png'), fullPage: true });
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toBe(payloads[0]);
  expect(payloads[0]).not.toContain('private-browser-only-answer');
  await page.getByRole('link', { name: 'Back to Today', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'All caught up', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from Library: Published test set', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No saved sets' })).toBeVisible();
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.getByRole('link', { name: 'Revue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All caught up', exact: true })).toBeVisible();
});

test('Today and saved recall remain usable across widths and enlarged text', async ({ page, pilot }, info) => {
  let ratings = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/reviews/')) ratings += 1;
  });
  pilot.addSaveableSet();
  await signup(page, pilot.invitation());
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  for (const [width, height, textSize] of [
    [375, 667, '100%'],
    [320, 568, '100%'],
    [390, 844, '100%'],
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
    await expect(page.getByRole('link', { name: 'Review 1 card' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your review', exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    const homeBrand = await brandBounds(page);
    await page.screenshot({ path: info.outputPath(`today-${width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Review 1 card' }).click();
    await expect(page.getByRole('link', { name: 'Help', exact: true })).toHaveCount(0);
    await expect(page.getByRole('progressbar', { name: 'Batch progress' })).toHaveAttribute('value', '0');
    await expect(page.getByRole('heading', { name: 'Test question', exact: true })).toBeFocused();
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    const reviewBrand = await brandBounds(page);
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(reviewBrand[dimension], `brand ${dimension} at ${width}px / ${textSize}`).toBeCloseTo(homeBrand[dimension], 0);
    }
    await page.getByLabel('Your answer (optional)').fill('A draft kept when the viewport changes');
    const reveal = page.getByRole('button', { name: 'Show answer' });
    if ((height >= 768 || width === 375) && textSize === '100%') await expect(reveal).toBeInViewport({ ratio: 1 });
    if (width === 375 && textSize === '100%') {
      await expect(page.getByRole('button', { name: 'I don’t know yet', exact: true })).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: info.outputPath(`review-front-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Show answer' }).focus();
    await page.keyboard.press('Enter');
    const rotatingCard = page.locator('.transform-3d');
    await expect(rotatingCard).toHaveCSS('animation-name', width === 320 ? 'none' : 'flip-to-back');
    await rotatingCard.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    await expect(page.getByRole('heading', { name: 'Test answer', exact: true })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Test question', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('paragraph').filter({ hasText: 'A draft kept when the viewport changes' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Good:/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const ratingButtons = page.getByRole('group', { name: 'Rate your answer' }).locator('button');
    if ([768, 1024, 1366, 844].includes(width)) {
      const first = (await ratingButtons.first().boundingBox())!;
      const last = (await ratingButtons.last().boundingBox())!;
      expect(last.y).toBe(first.y);
    }
    await page.screenshot({ path: info.outputPath(`review-${width}.png`), fullPage: true });
    for (const name of [/^Good:/, /^Missed:/, /^Hard:/, /^Easy:/]) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(48);
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }
    await page.getByRole('button', { name: 'Back to question' }).click();
    await expect(page.getByRole('heading', { name: 'Test question', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: /^Good:/ })).toHaveCount(0);
    await expect(page.getByLabel('Your answer (optional)')).toHaveValue('A draft kept when the viewport changes');
    await page.getByRole('button', { name: 'Back to answer' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: 'Test answer', exact: true })).toBeFocused();
    await expect(page.getByRole('progressbar', { name: 'Batch progress' })).toHaveAttribute('value', '0');
  }
  expect(ratings).toBe(0);
  await page.getByRole('link', { name: 'Finish for now' }).click();
  await expect(page.getByRole('link', { name: 'Review 1 card' })).toBeVisible();
});

test('review session checks stay quiet and preserve the layout on iPhone SE', async ({ page, pilot }, info) => {
  pilot.addSaveableSet();
  await signup(page, pilot.invitation());
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.goto('/review');
  await page.getByLabel('Your answer (optional)').fill('Keep my answer while checking the session');

  for (const [width, height, textSize] of [
    [375, 667, '100%'], [320, 568, '100%'], [375, 667, '200%'], [667, 375, '100%'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, textSize);
    const before = (await page.getByRole('heading', { name: 'Review', exact: true }).boundingBox())!;
    let resume!: () => void;
    const pending = new Promise<void>((resolve) => { resume = resolve; });
    await page.route('**/api/v1/me', async (route) => {
      await pending;
      await route.continue();
    });
    try {
      const recheck = page.waitForRequest((request) => request.url().endsWith('/api/v1/me'));
      await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      });
      await recheck;
      await expect(page.getByText('Checking session…', { exact: true })).toHaveCount(0);
      const brand = (await page.getByRole('link', { name: 'Revue', exact: true }).boundingBox())!;
      const heading = (await page.locator('h1').boundingBox())!;
      expect(heading.y).toBeGreaterThanOrEqual(brand.y + brand.height);
      expect(heading.y).toBe(before.y);
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
  await signup(page, pilot.invitation());
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.goto('/review');
  await page.getByRole('button', { name: 'Show answer' }).click();
  const second = await context.newPage();
  await second.goto(`${pilot.origin}/review`);
  await second.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByRole('heading', { name: '1 card reviewed', exact: true })).toBeFocused();
  await second.getByRole('button', { name: /^Hard:/ }).click();
  await expect(second.getByRole('status')).toContainText('another tab');
  await expect(second.getByRole('heading', { name: '0 cards reviewed', exact: true })).toBeFocused();
  await expect(second.getByText('All caught up.', { exact: true })).toBeVisible();
  await second.getByRole('link', { name: 'Back to Today' }).click();
  await expect(second.getByRole('heading', { name: 'All caught up', exact: true })).toBeVisible();
});
