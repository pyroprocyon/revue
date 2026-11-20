import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';

async function register(page: Page, signupUrl: string) {
  const username = `library_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  await page.goto(signupUrl);
  await page.getByRole('textbox', { name: 'Username' }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('kanjii');
  await page.getByLabel('Confirm password', { exact: true }).fill('kanjii');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByText(username, { exact: true })).toBeVisible();
  return username;
}

async function signIn(page: Page, username: string) {
  await page.getByRole('textbox', { name: 'Username' }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('kanjii');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('removal refreshes Library, supports resaving, and recovers a lost response', async ({
  page,
  context,
  pilot,
}, info) => {
  pilot.addSaveableSet();
  await register(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.getByRole('link', { name: 'Open Library', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Remove from Library: Published test set', exact: true });
  await remove.focus();
  await page.keyboard.press('Enter');
  const notice = page.getByRole('status').filter({ hasText: 'Removed “Published test set”' });
  await expect(notice).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Published test set', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('library-removed-phone.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'How it works', exact: true })).toHaveCount(0);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.getByRole('link', { name: 'Open Library', exact: true }).click();
  let lost = false;
  await page.route('**/api/v1/sets/*/save', async (route) => {
    if (route.request().method() === 'DELETE' && !lost) {
      lost = true;
      const response = await route.fetch();
      expect(response.status()).toBe(204);
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await remove.click();
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm removal');
  await expect(page.getByRole('heading', { name: 'Published test set', exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/v1/me/saved-sets')).json()).items).toHaveLength(0);
  await page.getByRole('button', { name: 'Try removing again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/sets/*/save');
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.getByRole('link', { name: 'Open Library', exact: true }).click();
  await expect(remove).toBeVisible();
  await context.clearCookies();
  await remove.click();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Flibrary$/);
});

test('onboarding samples offer practice and reject direct saves', async ({ page, pilot }) => {
  await register(page, pilot.signupUrl);
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  for (const key of ['philippine-history', 'philippine-nature', 'weather-and-disasters']) {
    const summary = await (await page.request.get(`/api/v1/public-sets/${key}`)).json();
    expect(summary.saveAllowed).toBe(false);
    await page.goto(`/s/${summary.shareCode}`);
    await expect(page.getByRole('link', { name: 'Try 5 cards' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save to Library' })).toHaveCount(0);
    const response = await page.request.post(`/api/v1/sets/${Number.parseInt(summary.shareCode, 36)}/save`, {
      headers: { [csrf.headerName]: csrf.token },
    });
    expect(response.status()).toBe(404);
  }
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
});

test('signing in from a private Library link returns to Library', async ({ page, pilot }) => {
  const name = await register(page, pilot.signupUrl);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/library');
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Flibrary$/);
  await signIn(page, name);
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
});

test('Account presents the profile without reading or promoting Library content', async ({ page, pilot }) => {
  let reads = 0;
  await page.route('**/api/v1/me/saved-sets', (route) => {
    reads += 1;
    return route.fulfill({ status: 503, json: {} });
  });
  await register(page, pilot.signupUrl);
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^(Browse sets|Open Library)$/ })).toHaveCount(0);
  expect(reads).toBe(0);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('saved sets couldn’t load');
  expect(reads).toBe(1);
});

test('retired-set removal warns, supports keyboard cancellation and fits narrow screens', async ({
  page,
  pilot,
}, info) => {
  pilot.addSaveableSet();
  await register(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  // Exercise the retired presentation without retiring shared fixtures used by other journeys.
  await page.route('**/api/v1/me/saved-sets', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, items: body.items.map((set: object) => ({ ...set, retired: true })) },
    });
  });
  await page.getByRole('link', { name: 'Open Library', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Remove from Library: Published test set' });
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'DELETE') writes += 1;
  });
  await remove.focus();
  await page.keyboard.press('Enter');
  const keep = page.getByRole('button', { name: 'Keep set', exact: true });
  await expect(keep).toBeFocused();
  await expect(page.getByText(/you won’t be able to save it again/)).toBeVisible();
  for (const [label, width, height, scale] of [
    ['phone', 360, 800, 100],
    ['tablet', 640, 900, 100],
    ['desktop', 1280, 900, 100],
    ['enlarged', 320, 568, 200],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}%`;
    }, scale);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const button of [keep, page.getByRole('button', { name: 'Remove from Library', exact: true })]) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    }
    await page.screenshot({ path: info.outputPath(`retired-remove-${label}.png`), fullPage: true });
  }
  await keep.click();
  await expect(remove).toBeFocused();
  expect(writes).toBe(0);
  await page.keyboard.press('Enter');
  await expect(keep).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Remove from Library', exact: true })).toBeFocused();
  const refreshedLibrary = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/me/saved-sets' && response.ok(),
  );
  await page.keyboard.press('Enter');
  expect((await (await refreshedLibrary).json()).items).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
});

test('explicit save survives sign-in return, duplicate save, reload and another learner', async ({
  page,
  browser,
  pilot,
}, info) => {
  pilot.addSaveableSet();
  const name = await register(page, pilot.signupUrl);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create a deck', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('library-empty-phone.png'), fullPage: true });
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/sets/published-test-set');
  await page.getByRole('link', { name: 'Sign in to save' }).click();
  await signIn(page, name);
  await expect(page).toHaveURL(/\/sets\/published-test-set$/);
  await expect(page.getByRole('button', { name: 'Save to Library' })).toBeVisible();
  expect((await (await page.request.get('/api/v1/me/saved-sets')).json()).items).toHaveLength(0);

  const saveButton = page.getByRole('button', { name: 'Save to Library' });
  await saveButton.focus();
  await expect(saveButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Open Library' })).toBeFocused();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  await page.screenshot({ path: info.outputPath('preview-saved-phone.png'), fullPage: true });
  await page.getByRole('link', { name: 'Open Library' }).click();
  await expect(page.getByRole('heading', { name: 'Published test set' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Published test set' })).toBeVisible();
  await page.getByRole('link', { name: 'Revue', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('link', { name: 'View set: Published test set' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  const saved = await (await page.request.get('/api/v1/me/saved-sets')).json();
  expect(saved.items).toHaveLength(1);
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  const duplicate = await page.request.post(`/api/v1/sets/${saved.items[0].id}/save`, {
    headers: { [csrf.headerName]: csrf.token },
  });
  expect(duplicate.ok()).toBe(true);
  expect((await duplicate.json()).savedAt).toBe(saved.items[0].savedAt);

  for (const [label, width, height, scale] of [
    ['phone', 360, 800, 100],
    ['tablet', 768, 1024, 100],
    ['desktop', 1440, 900, 100],
    ['enlarged', 320, 568, 200],
    ['landscape', 740, 360, 100],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}%`;
    }, scale);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: info.outputPath(`library-${label}.png`), fullPage: true });
    for (const label of ['Library', 'Account']) {
      const link = page.getByRole('link', { name: label, exact: true });
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      const colors = await link.evaluate((element) => {
        const style = getComputedStyle(element);
        return { text: style.color, background: style.backgroundColor };
      });
      expect(colors.text).not.toBe(colors.background);
    }
  }

  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await register(otherPage, pilot.signupUrl);
    await otherPage.goto(`${pilot.origin}/library`);
    await expect(otherPage.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
    expect((await (await otherPage.request.get(`${pilot.origin}/api/v1/me/saved-sets`)).json()).items).toHaveLength(0);
  } finally {
    await other.close();
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/privacy');
  await expect(page.getByText(/We keep the sets you save/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('privacy-saved-data-phone.png'), fullPage: true });
});

test('lost save response is unconfirmed until a duplicate-safe retry, with expired-session recovery', async ({
  page,
  context,
  pilot,
}, info) => {
  pilot.addSaveableSet();
  await register(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await expect(page.getByRole('button', { name: 'Save to Library' })).toBeVisible();
  let interrupted = false;
  await page.route('**/api/v1/sets/*/save', async (route) => {
    if (route.request().method() === 'POST' && !interrupted) {
      interrupted = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save to Library' }).press('Enter');
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm');
  await expect(page.getByRole('button', { name: 'Try saving again' })).toBeFocused();
  await expect(page.getByText('Saved to your Library')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('save-unknown-phone.png'), fullPage: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Open Library' })).toBeFocused();
  await expect(page.getByText('Saved to your Library')).toBeVisible();
  expect((await (await page.request.get('/api/v1/me/saved-sets')).json()).items).toHaveLength(1);
  await page.unroute('**/api/v1/sets/*/save');

  await page.goto('/library');
  await context.clearCookies();
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Flibrary$/);
  await expect(page.getByRole('heading', { name: 'Published test set' })).toHaveCount(0);
});

test('Library read failures retain an explicit retry instead of showing an empty library', async ({ page, pilot }) => {
  await register(page, pilot.signupUrl);
  await page.route('**/api/v1/me/saved-sets', (route) => route.abort('connectionreset'));
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('saved sets couldn’t load');
  await expect(page.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/me/saved-sets');
  await page.getByRole('button', { name: 'Retry saved sets' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create a deck', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved sets', exact: true })).toHaveCount(0);
});

test('the shortcut brings Saved sets above the phone navigation and moves keyboard focus', async ({ page, pilot }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  pilot.addSaveableSet();
  await register(page, pilot.signupUrl);
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  for (const title of ['Biology', 'Chemistry', 'Physics']) {
    expect(
      (
        await page.request.post('/api/v1/decks', {
          data: { title },
          headers: { [csrf.headerName]: csrf.token },
        })
      ).status(),
    ).toBe(201);
  }
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.getByRole('link', { name: 'Open Library' }).click();
  const shortcut = page.getByRole('link', { name: 'Jump to saved sets' });
  await shortcut.focus();
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { name: 'Saved sets', exact: true });
  await expect(heading).toBeFocused();
  const nav = page.getByRole('navigation', { name: 'Your workspace' });
  await expect
    .poll(async () => {
      const [headingBox, navBox] = await Promise.all([heading.boundingBox(), nav.boundingBox()]);
      return Boolean(headingBox && navBox && headingBox.y >= 0 && headingBox.y + headingBox.height <= navBox.y);
    })
    .toBe(true);
});

test('Library lists refresh at 30 seconds or after a browser return', async ({ page, pilot }) => {
  await register(page, pilot.signupUrl);
  const reads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/decks' || path === '/api/v1/me/saved-sets') reads.push(path);
  });
  const tabs = page.getByRole('navigation', { name: 'Your workspace' });
  const library = tabs.getByRole('link', { name: 'Library' });
  const account = tabs.getByRole('link', { name: 'Account' });
  const loadedAt = (await page.evaluate(() => Date.now())) + 1_000;
  await page.clock.setFixedTime(new Date(loadedAt));
  const savedSets = page.waitForResponse('**/api/v1/me/saved-sets');
  await library.click();
  await (await savedSets).finished();
  await expect(page.getByRole('link', { name: 'Create a deck' })).toBeVisible();
  await account.click();
  await page.clock.setFixedTime(new Date(loadedAt + 29_999));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await library.click();
  await expect(page.getByRole('link', { name: 'Create a deck' })).toBeVisible();
  expect(reads.sort()).toEqual(['/api/v1/decks', '/api/v1/me/saved-sets']);
  await account.click();
  await page.clock.setFixedTime(new Date(loadedAt + 30_000));
  const [decksAtExpiry, setsAtExpiry] = await Promise.all([
    page.waitForResponse('**/api/v1/decks'),
    page.waitForResponse('**/api/v1/me/saved-sets'),
    library.click(),
  ]);
  await Promise.all([decksAtExpiry.finished(), setsAtExpiry.finished()]);
  expect(reads).toHaveLength(4);
  await account.click();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await library.click();
  await expect.poll(() => reads.filter((path) => path === '/api/v1/decks').length).toBe(3);
  await expect.poll(() => reads.filter((path) => path === '/api/v1/me/saved-sets').length).toBe(3);
});

test('Library preserves its page through a preview and offers Previous after a failed read', async ({
  page,
  pilot,
}) => {
  await register(page, pilot.signupUrl);
  let failSecondPage = true;
  await page.route('**/api/v1/me/saved-sets**', async (route) => {
    const secondPage = new URL(route.request().url()).searchParams.has('after');
    if (secondPage && failSecondPage) {
      await route.fulfill({ status: 503 });
      return;
    }
    await route.fulfill({
      json: {
        items: [
          {
            id: secondPage ? '2' : '1',
            title: secondPage ? 'Philippine Nature' : 'Philippine History',
            setKey: secondPage ? 'philippine-nature' : 'philippine-history',
            description: 'A saved set.',
            publisherName: 'Revue',
            cardCount: 5,
            retired: false,
            saveAllowed: true,
          },
        ],
        nextCursor: secondPage ? null : '1',
      },
    });
  });
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('alert')).toContainText('saved sets couldn’t load');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByRole('heading', { name: 'Philippine History' })).toBeVisible();

  failSecondPage = false;
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('link', { name: 'View set: Philippine Nature' }).click();
  await expect(page).toHaveURL(/\/sets\/philippine-nature$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Philippine Nature' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Philippine Nature' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByRole('heading', { name: 'Philippine History' })).toBeVisible();
});
