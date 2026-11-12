import type { Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';

test('tablet preview actions follow the content instead of sitting at the bottom of the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/sets/philippine-history');
  const article = page.getByRole('article');
  const start = page.getByRole('link', { name: 'Try 5 cards' });
  await expect(start).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const content = await article.boundingBox();
  const action = await start.boundingBox();
  expect(content).not.toBeNull();
  expect(action).not.toBeNull();
  expect(action!.y).toBeGreaterThanOrEqual(content!.y + content!.height);
  expect(action!.y - content!.y - content!.height).toBeLessThanOrEqual(64);
});

test('Privacy and Terms pin the sign-in link only when the phone has room', async ({ page }) => {
  for (const path of ['/privacy', '/terms']) {
    await page.setViewportSize({ width: 360, height: 744 });
    await page.goto(path);
    const back = page.getByRole('link', { name: 'Back to sign in', exact: true });
    await expect(back).toBeInViewport({ ratio: 1 });
    const content = page.getByRole('main');
    expect(await content.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');

    await page.setViewportSize({ width: 360, height: 480 });
    expect(await content.evaluate(element => getComputedStyle(element).overflowY)).toBe('visible');
    await back.scrollIntoViewIfNeeded();
    await expect(back).toBeInViewport({ ratio: 1 });

    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await content.evaluate(element => getComputedStyle(element).overflowY)).toBe('visible');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await back.scrollIntoViewIfNeeded();
    await expect(back).toBeInViewport({ ratio: 1 });
  }
});

test('tablet trial keeps recall and rating controls within a compact card', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/sets/philippine-history/try');
  const check = page.getByRole('button', { name: 'Check answer', exact: true });
  await expect(check).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect((await check.boundingBox())!.y).toBeLessThan(700);
  await check.click();
  for (const rating of ['Missed', 'Hard', 'Good', 'Easy']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${rating}:`) })).toBeInViewport({ ratio: 1 });
  }
});

test('landing action and study headings fit at 320 pixels with 200% text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const title = page.getByRole('heading', { name: 'Review before it’s due.' });
  await expectWordOnOneLine(title, 'Review');
  await expectWordOnOneLine(title, 'before');
  await expectWordOnOneLine(page.getByText('Tomorrow', { exact: true }), 'Tomorrow');
  const browse = page.getByRole('link', { name: 'Browse sets' });
  // Check the initial screen before click scrolls the link into view.
  await expect(browse).toBeInViewport({ ratio: 1 });
  await browse.click();
  await expectWordOnOneLine(page.getByText('Philippine History', { exact: true }), 'Philippine');
  await page.getByRole('link', { name: /^Philippine History/ }).click();
  await expectWordOnOneLine(page.getByRole('heading', { name: 'Philippine History' }), 'Philippine');
  await page.getByRole('link', { name: 'Try 5 cards' }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  const answer = page.getByRole('heading', { name: 'Lapulapu, the chief of Mactan' });
  await expectWordOnOneLine(answer, 'Lapulapu,');
  await expectWordOnOneLine(answer, 'Mactan');
  expect(await page.getByRole('main').evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByText('Card 2 of 5', { exact: true })).toBeVisible();
});

test('account help and trial source links offer a 48-pixel target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sign-in');
  await expectTouchTarget(page.getByRole('link', { name: 'Contact support' }));
  await page.goto('/register');
  await expectTouchTarget(page.getByRole('link', { name: 'Sign in', exact: true }));
  await page.goto('/sets/philippine-history/try');
  await page.getByRole('button', { name: 'Check answer' }).click();
  const source = page.getByRole('link', { name: 'NHCP historical marker' });
  await expectTouchTarget(source);
  await expect(source).toBeInViewport({ ratio: 1 });
});

test('invitation and guide text keep room for whole words at 320 pixels with 200% text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/join');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expectWordOnOneLine(page.getByRole('heading', { name: 'You’ll need an invitation' }), 'invitation');
  await page.getByRole('link', { name: 'Browse sets' }).click();
  await expect(page.getByRole('heading', { name: 'Practice sets' })).toBeVisible();
  await page.goto('/how-it-works');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expectWordOnOneLine(page.getByRole('heading', { name: 'How spaced repetition works' }), 'repetition');
  await expectWordOnOneLine(page.getByText('Answer from memory.', { exact: true }), 'Answer');
  await expectWordOnOneLine(page.getByText('Practice again later.', { exact: true }), 'Practice');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('keyboard reveal and tabbing keep enlarged answers and ratings reachable with either motion setting', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/sets/philippine-history/try');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.getByRole('button', { name: 'Check answer', exact: true }).focus();
    await page.keyboard.press('Enter');
    const answer = page.getByRole('heading', { name: 'Lapulapu, the chief of Mactan' });
    await expect(answer).toBeFocused();
    await expect(answer).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'NHCP historical marker' })).toBeFocused();
    for (const rating of ['Missed', 'Hard', 'Good', 'Easy']) {
      await page.keyboard.press('Tab');
      const button = page.getByRole('button', { name: new RegExp(`^${rating}:`) });
      await expect(button).toBeFocused();
      // Native focus scrolling can round a fractional CSS-pixel edge at the viewport boundary.
      await expect.poll(async () => {
        const bounds = await button.boundingBox();
        return bounds !== null && bounds.y >= -1 && bounds.y + bounds.height <= 569;
      }).toBe(true);
    }
    await page.keyboard.press('Enter');
    await expect(page.getByText('Card 2 of 5', { exact: true })).toBeVisible();
  }
});

test('account controls remain reachable without promoting the public trial', async ({ page, pilot }) => {
  await page.goto(pilot.invitation());
  const username = `layout_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const password = randomUUID();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });

  for (const [width, height, textSize] of [[390, 844, '100%'], [768, 1024, '100%'], [1366, 900, '100%'], [320, 568, '200%']] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, textSize);
    await expectTouchTarget(signOut);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await expect(page.locator('a[href="/sets"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Try a practice set' })).toHaveCount(0);
  await signOut.click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('long forms use document scrolling when the available keyboard viewport is short', async ({ page, pilot }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(pilot.invitation());
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.getByLabel('Username').fill('form_' + randomUUID().slice(0, 12));
  await page.setViewportSize({ width: 320, height: 320 });
  const password = randomUUID();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password + 'x');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const error = page.getByRole('alert');
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport();
  expect(await page.getByRole('main').evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
});

test('a failed session request offers retry before showing the signed-in workspace', async ({ page, pilot }) => {
  await page.goto(pilot.invitation());
  await page.getByLabel('Username').fill('retry_' + randomUUID().slice(0, 12));
  const password = randomUUID();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.route('**/api/v1/me', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Check your connection and try again.');
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await page.unroute('**/api/v1/me');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
});

async function expectWordOnOneLine(heading: Locator, word: string) {
  const fragments = await heading.evaluate(async (element, text) => {
    await document.fonts.ready;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent?.indexOf(text) ?? -1;
      if (start === -1) continue;
      const range = new Range();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      return range.getClientRects().length;
    }
    return 0;
  }, word);
  expect.soft(fragments, `“${word}” fits on one line`).toBe(1);
}

async function expectTouchTarget(link: Locator) {
  await link.scrollIntoViewIfNeeded();
  const target = await link.evaluate((element) => {
    const { width, height, x, y } = element.getBoundingClientRect();
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const hits = (px: number, py: number) => element.contains(document.elementFromPoint(px, py));
    const edgesHit = hits(centerX - 23, centerY) && hits(centerX + 23, centerY)
      && hits(centerX, centerY - 23) && hits(centerX, centerY + 23);
    return { width, height, edgesHit };
  });
  expect.soft(target.width).toBeGreaterThanOrEqual(48);
  expect.soft(target.height).toBeGreaterThanOrEqual(48);
  expect.soft(target.edgesHit).toBe(true);
}
