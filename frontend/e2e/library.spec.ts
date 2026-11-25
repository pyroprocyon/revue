import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test, expect, signOut } from './fixtures';

const savedSetsPath = (url: URL) => url.pathname === '/api/v1/me/saved-sets';

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

test('Back restores the Saved shelf after its reviewer bundle fails to load', async ({ page, pilot }) => {
  pilot.addSaveableSet();
  await register(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByRole('link', { name: 'Open Library' })).toBeVisible();
  await page.goto('/library?shelf=saved');

  await page.route('**/assets/SavedSetBrowser-*.js', (route) => route.abort('failed'));
  const reviewer = page.getByRole('link', { name: 'Open Published test set', exact: true });
  await reviewer.click();
  const failure = page.getByRole('heading', { name: 'Something went wrong' });
  await expect(failure).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/library\?shelf=saved$/);
  await expect(reviewer).toBeVisible();
  await expect(failure).toHaveCount(0);
});

test('a paused saved-set link loads directly and retries its own failed read', async ({ page, pilot }) => {
  pilot.addSaveableSet();
  await register(page, pilot.signupUrl);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  const open = page.getByRole('link', { name: 'Open Library' });
  const linkedSet = (await open.getAttribute('href'))!;
  const id = new URL(linkedSet, page.url()).searchParams.get('set');
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  const pause = await page.request.put(`/api/v1/me/saved-sets/${id}/pause`, {
    headers: { [csrf.headerName]: csrf.token },
  });
  expect(pause.status()).toBe(204);

  const reads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/decks' || path.startsWith('/api/v1/me/saved-sets')) reads.push(path);
  });
  const detail = `/api/v1/me/saved-sets/${id}`;
  let failDetail!: () => void;
  const pendingDetail = new Promise<void>((resolve) => {
    failDetail = resolve;
  });
  await page.route(
    (url) => url.pathname === detail,
    async (route) => {
      await pendingDetail;
      await route.fulfill({ status: 503 });
    },
    { times: 1 },
  );
  try {
    const firstCards = page.waitForResponse((response) => new URL(response.url()).pathname === `${detail}/cards`);
    await open.click();
    expect((await firstCards).status()).toBe(200);
    expect([...reads].sort()).toEqual([detail, `${detail}/cards`]);
    await expect(page.getByRole('list', { name: 'Cards' })).toHaveCount(0);
  } finally {
    failDetail();
  }
  await expect(page.getByRole('alert')).toContainText('This saved reviewer couldn’t load');
  await expect(page).toHaveURL(new URL(linkedSet, page.url()).href);

  await page.getByRole('button', { name: 'Retry saved reviewer', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Published test set', exact: true })).toBeFocused();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Cards' }).getByRole('button', { name: /Test question/ })).toBeVisible();
  expect([...reads].sort()).toEqual([detail, detail, `${detail}/cards`]);
  await page.getByRole('link', { name: 'Back to Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
});

test('saved cards can be searched and opened read-only on a phone and tablet', async ({ page, pilot }) => {
  pilot.addSaveableSet();
  await register(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.getByRole('link', { name: 'Open Library' }).click();
  await page.setViewportSize({ width: 320, height: 568 });
  const { items: saved } = await (await page.request.get('/api/v1/me/saved-sets')).json();
  const { items } = await (await page.request.get(`/api/v1/me/saved-sets/${saved[0].id}/cards`)).json();
  const question = items[0].question;
  await expect(page.getByRole('heading', { name: 'Published test set', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Library collections' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to Library', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Help', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Remove from Library/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Public preview/ })).toHaveCount(0);
  const about = page.getByRole('button', { name: 'About this reviewer' });
  await expect(about).toHaveAttribute('aria-expanded', 'false');
  const closedGradient = await about.evaluate((button) => getComputedStyle(button).backgroundImage);
  await about.click();
  await expect(about).toHaveAttribute('aria-expanded', 'true');
  await expect(about).not.toHaveCSS('background-image', closedGradient);
  await expect(page.getByText(saved[0].description, { exact: true })).toBeVisible();
  await about.click();
  await expect(about).toHaveCSS('background-image', closedGradient);
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Reviewer settings' });
  await expect(settings.getByRole('button', { name: /Remove from Library/ })).toBeVisible();
  const preview = settings.getByRole('link', { name: 'Public preview: Published test set', exact: true });
  await expect(preview).toHaveAccessibleDescription('Open the shareable page for this reviewer.');
  await expect(preview).toHaveAttribute('href', '/sets/published-test-set');
  await expect(settings.getByText('Public preview', { exact: true })).toHaveCount(1);
  await settings.getByRole('button', { name: 'Back to cards' }).click();
  await expect(page.getByRole('button', { name: 'Reviewer settings' })).toBeFocused();
  const row = page.getByRole('list', { name: 'Cards' }).getByRole('button', { name: question, exact: false });
  await row.click();
  const reader = page.getByRole('dialog', { name: question });
  await expect(reader.getByText(items[0].answer, { exact: true })).toBeVisible();
  await expect(reader.getByRole('button', { name: /Edit|Delete|Rate/ })).toHaveCount(0);
  await reader.getByRole('button', { name: 'Back to cards' }).click();
  await expect(row).toBeFocused();
  await page.getByRole('button', { name: 'Search cards' }).click();
  const search = page.getByRole('searchbox', { name: 'Search cards' });
  await search.fill('no matching question');
  await search.press('Enter');
  await expect(page.getByText('No cards match your search.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toBeVisible();
  await page.setViewportSize({ width: 920, height: 900 });
  const selectedCard = page.getByRole('region', { name: 'Selected card' });
  await expect(selectedCard.getByRole('heading', { name: question })).toBeVisible();
  await row.focus();
  await page.keyboard.press('Tab');
  await expect(selectedCard).toBeFocused();
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  const pane = page.getByRole('region', { name: 'Reviewer settings' });
  const remove = pane.getByRole('button', { name: /Remove from Library/ });
  expect((await remove.boundingBox())!.width).toBeCloseTo(
    (await pane.getByRole('link', { name: /Public preview/ }).boundingBox())!.width,
  );
  await pane.getByRole('button', { name: 'Close reviewer settings' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(920);
  await page.getByRole('link', { name: 'Back to Library', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open Published test set' })).toBeVisible();
});

test('saved set reviews can pause from Today and resume from Reviewer settings', async ({ page, pilot }, info) => {
  pilot.addSaveableSet();
  await register(page, pilot.signupUrl);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.getByRole('link', { name: 'Open Library' }).click();
  const detail = page.url();
  const start = page.getByRole('link', { name: 'Start review: Published test set' });
  await start.click();
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
  await page.getByRole('link', { name: 'Finish for now' }).click();
  await expect(page.getByRole('link', { name: 'Continue', exact: true })).toBeVisible();

  await page.goto(detail);
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Reviewer settings' });
  await sheet.getByRole('button', { name: 'Pause reviews' }).press('Enter');
  const resume = sheet.getByRole('button', { name: 'Resume reviews' });
  await expect(resume).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: info.outputPath('paused-set-phone.png') });
  await sheet.getByRole('button', { name: 'Back to cards' }).click();
  await expect(start).toHaveCount(0);
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Cards' }).getByRole('button', { name: /Test question/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Library', exact: true }).click();
  const active = page.getByRole('button', { name: 'Review status: Active' });
  await expect(active).toHaveCSS('color', 'rgb(24, 100, 171)');
  await active.click();
  await page.getByRole('button', { name: 'Paused 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review status: Paused' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Open Published test set' })).toBeVisible();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your review', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No cards to review yet' })).toBeVisible();
  await expect(page.getByText('Published test set', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Continue', exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(detail);
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  const settings = page.getByRole('region', { name: 'Reviewer settings' });
  await settings.getByRole('button', { name: 'Resume reviews' }).click();
  await expect(settings.getByRole('button', { name: 'Pause reviews' })).toBeEnabled();
  await expect(start).toBeVisible();
  await page.screenshot({ path: info.outputPath('resumed-set-desktop.png') });
});

test('removal refreshes Library, supports resaving, and recovers a lost response', async ({
  page,
  context,
  pilot,
}, info) => {
  pilot.addSaveableSet();
  await page.clock.install();
  const username = await register(page, pilot.signupUrl);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.getByRole('link', { name: 'Open Library', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  const remove = page.getByRole('button', { name: 'Remove from Library: Published test set', exact: true });
  const confirm = page.getByRole('button', { name: 'Remove', exact: true });
  await expect(remove).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(remove).toHaveCSS('border-top-width', '1px');
  await expect(remove).toHaveCSS('color', 'rgb(201, 42, 42)');
  await expect(remove.locator('svg')).toBeVisible();
  await remove.focus();
  await page.keyboard.press('Enter');
  const keep = page.getByRole('button', { name: 'Keep', exact: true });
  await expect(page.getByRole('region', { name: 'Remove from Library?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Remove from Library', exact: true })).toHaveCount(0);
  await expect(page.getByText('Your review progress stays saved.', { exact: true })).toHaveCount(0);
  await expect(keep).toBeFocused();
  await expect(keep).toHaveAccessibleDescription(/Your progress is kept/);
  await expect(confirm).toHaveCSS('font-size', await keep.evaluate((button) => getComputedStyle(button).fontSize));
  await expect(confirm).toBeInViewport({ ratio: 1 });
  expect(
    await confirm.evaluate((button) => {
      const { x, y, width, height } = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    }),
  ).toBe(true);
  expect((await (await page.request.get('/api/v1/me/saved-sets')).json()).items).toHaveLength(1);
  await page.keyboard.press('Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Enter');
  const notice = page.getByRole('status').filter({ hasText: 'Removed “Published test set”' });
  await expect(notice).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Published test set', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('library-removed-phone.png'), fullPage: true });
  await page.clock.fastForward(6_000);
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('main')).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'How it works', exact: true })).toHaveCount(0);
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.getByRole('link', { name: 'Open Library', exact: true }).click();
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
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
  await confirm.click();
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm removal');
  await expect(page.getByRole('heading', { name: 'Published test set', exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/v1/me/saved-sets')).json()).items).toHaveLength(0);
  await page.getByRole('button', { name: 'Try removing again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/sets/*/save');
  await page.goto('/sets/published-test-set');
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await page.getByRole('link', { name: 'Open Library', exact: true }).click();
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  await expect(remove).toBeVisible();
  const { pathname, search } = new URL(page.url());
  const reviewerPath = pathname + search;
  await context.clearCookies();
  await remove.click();
  await confirm.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === '/sign-in' && url.searchParams.get('returnTo') === reviewerPath,
  );
  await signIn(page, username);
  await expect(page).toHaveURL(new URL(reviewerPath, page.url()).href);
  await expect(page.getByRole('heading', { name: 'Published test set', exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/v1/me/saved-sets')).json()).items).toHaveLength(1);
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
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
});

test('signing in from a private Library link returns to Library', async ({ page, pilot }) => {
  const name = await register(page, pilot.signupUrl);
  await signOut(page);
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/library');
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Flibrary$/);
  await signIn(page, name);
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
});

test('Account presents the profile without reading or promoting Library content', async ({ page, pilot }) => {
  let reads = 0;
  await page.route(savedSetsPath, (route) => {
    reads += 1;
    return route.fulfill({ status: 503, json: {} });
  });
  await register(page, pilot.signupUrl);
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^(Browse reviewers|Open Library)$/ })).toHaveCount(0);
  expect(reads).toBe(0);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('saved reviewers couldn’t load');
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
  await page.route(/\/api\/v1\/me\/saved-sets\/\d+$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), retired: true } });
  });
  await page.getByRole('link', { name: 'Open Library', exact: true }).click();
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  const remove = page.getByRole('button', { name: 'Remove from Library: Published test set' });
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'DELETE') writes += 1;
  });
  await remove.focus();
  await page.keyboard.press('Enter');
  const keep = page.getByRole('button', { name: 'Keep', exact: true });
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
    const settings = page.getByRole(label === 'desktop' ? 'region' : 'dialog', {
      name: 'Reviewer settings',
      exact: true,
    });
    await expect(settings).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const name of ['Keep', 'Remove']) {
      const button = settings.getByRole('button', { name, exact: true });
      await expect.poll(async () => (await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
    await page.screenshot({ path: info.outputPath(`retired-remove-${label}.png`), fullPage: true });
  }
  await keep.click();
  await expect(remove).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Remove from Library', exact: true })).toBeVisible();
  expect(writes).toBe(0);
  await page.keyboard.press('Enter');
  await expect(keep).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeFocused();
  const refreshedLibrary = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/me/saved-sets' && response.ok(),
  );
  await page.keyboard.press('Enter');
  expect((await (await refreshedLibrary).json()).items).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create a deck', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('library-empty-phone.png'), fullPage: true });
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await signOut(page);
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/sets/published-test-set');
  await page.getByRole('link', { name: 'Sign in to save' }).click();
  await signIn(page, name);
  await expect(page).toHaveURL(/\/sets\/published-test-set$/);
  await expect(page.getByRole('button', { name: 'Save to Library' })).toBeVisible();
  expect((await (await page.request.get('/api/v1/me/saved-sets')).json()).items).toHaveLength(0);

  const saveButton = page.getByRole('button', { name: 'Save to Library' });
  const openLibrary = page.getByRole('link', { name: 'Open Library', exact: true });
  await saveButton.focus();
  await expect(saveButton).toBeFocused();
  const saveSlot = await saveButton.boundingBox();
  await page.keyboard.press('Enter');
  await expect(openLibrary).toBeFocused();
  expect(await openLibrary.boundingBox()).toEqual(saveSlot);
  await expect(openLibrary).toHaveAccessibleDescription('Saved to your Library');
  await expect(openLibrary.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(openLibrary.getByText('Saved', { exact: true })).toBeVisible();
  const membershipUrl = '**/api/v1/sets/*/save';
  let releaseMembership!: () => void;
  const waitForRelease = new Promise<void>((resolve) => {
    releaseMembership = resolve;
  });
  await page.route(
    membershipUrl,
    async (route) => {
      await waitForRelease;
      await route.continue();
    },
    { times: 1 },
  );
  const refreshedMembership = page.waitForResponse(membershipUrl);
  try {
    await openLibrary.focus();
    await Promise.all([
      page.waitForRequest(membershipUrl),
      page.evaluate(() => window.dispatchEvent(new Event('visibilitychange'))),
    ]);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(openLibrary).toBeFocused();
    await expect(openLibrary.getByText('Saved', { exact: true })).toBeVisible();
  } finally {
    releaseMembership();
  }
  await refreshedMembership;
  await page.screenshot({ path: info.outputPath('preview-saved-phone.png'), fullPage: true });
  await openLibrary.click();
  await expect(page.getByRole('heading', { name: 'Published test set' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Published test set' })).toBeVisible();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('link', { name: 'Public preview: Published test set' })).toHaveCount(0);
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
    await expect(otherPage.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
    expect((await (await otherPage.request.get(`${pilot.origin}/api/v1/me/saved-sets`)).json()).items).toHaveLength(0);
  } finally {
    await other.close();
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/privacy');
  await expect(page.getByText(/We keep the reviewers you save/)).toBeVisible();
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
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('save-unknown-phone.png'), fullPage: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Open Library' })).toBeFocused();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
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
  await page.route(savedSetsPath, (route) => route.abort('connectionreset'));
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('saved reviewers couldn’t load');
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
  await page.unroute(savedSetsPath);
  await page.getByRole('button', { name: 'Retry saved reviewers' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create a deck', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved reviewers', exact: true })).toHaveCount(0);
});

test('the collection switch opens Saved by keyboard and keeps its count beside the label', async ({ page, pilot }) => {
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
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  const shelf = page.getByRole('button', { name: 'Saved 1', exact: true });
  const help = page.getByRole('link', { name: 'Help', exact: true });
  await expect(help).toHaveCount(0);
  await shelf.focus();
  await page.keyboard.press('Enter');
  await expect(shelf).toHaveAttribute('aria-pressed', 'true');
  await expect(shelf).toHaveCSS('border-bottom-width', '0px');
  await expect(shelf).toBeFocused();
  await expect(page.getByRole('link', { name: 'Open Published test set' })).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(shelf).toHaveAttribute('aria-pressed', 'true');
  await expect(shelf).toHaveCSS('border-bottom-color', 'rgb(24, 100, 171)');
  const [label, count] = await Promise.all([
    shelf.getByText('Saved', { exact: true }).boundingBox(),
    shelf.getByText('1', { exact: true }).boundingBox(),
  ]);
  expect(count!.x).toBeGreaterThanOrEqual(label!.x + label!.width);
  expect(Math.abs(count!.y + count!.height / 2 - (label!.y + label!.height / 2))).toBeLessThan(1);
  await expect(help).toBeVisible();
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
  const savedSets = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/me/saved-sets');
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
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/me/saved-sets'),
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

test('Saved reviewers status starts a new page and preserves search', async ({ page, pilot }) => {
  await register(page, pilot.signupUrl);
  await page.route(savedSetsPath, (route) => {
    const filters = new URL(route.request().url()).searchParams;
    const paused = filters.get('paused') === 'true';
    const later = filters.has('after');
    return route.fulfill({
      json: {
        items: [
          {
            id: paused ? '3' : later ? '2' : '1',
            title: paused ? 'Biology past exam' : later ? 'Biology finals' : 'Biology basics',
            setKey: 'philippine-history',
            cardCount: 5,
            reviewsPaused: paused,
          },
        ],
        nextCursor: paused || later ? null : '1',
        counts: { active: 2, paused: 1 },
      },
    });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/library?shelf=saved');
  await page.getByRole('searchbox', { name: 'Search reviewers' }).fill('Biology');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open Biology finals' })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.getByRole('button', { name: 'Review status: Active' }).press('Enter');
  const paused = page.getByRole('button', { name: 'Paused 1', exact: true });
  const box = (await paused.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await paused.press('Enter');
  await expect(page.getByRole('link', { name: 'Open Biology past exam' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search reviewers' })).toHaveValue('Biology');
  expect(new URL(page.url()).searchParams.has('after')).toBe(false);
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toHaveCount(0);
});

test('a failed Active shelf keeps the Saved status switch available', async ({ page, pilot }) => {
  await register(page, pilot.signupUrl);
  await page.route(savedSetsPath, (route) => {
    if (new URL(route.request().url()).searchParams.get('paused') !== 'true') {
      return route.fulfill({ status: 503 });
    }
    return route.fulfill({
      json: {
        items: [{ id: '1', title: 'Paused reviewer', setKey: 'philippine-history', cardCount: 5, reviewsPaused: true }],
        nextCursor: null,
        counts: { active: 1, paused: 1 },
      },
    });
  });

  await page.goto('/library?shelf=saved&setStatus=paused');
  const pausedReviewer = page.getByRole('link', { name: 'Open Paused reviewer' });
  await expect(pausedReviewer).toBeVisible();
  await page.getByRole('button', { name: 'Review status: Paused' }).click();
  await page.getByRole('button', { name: 'Active 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry saved reviewers' })).toBeVisible();
  const activeStatus = page.getByRole('button', { name: 'Review status: Active' });
  await expect(activeStatus).toBeFocused();
  await activeStatus.press('Enter');
  await page.getByRole('button', { name: 'Paused', exact: true }).press('Enter');
  await expect(pausedReviewer).toBeVisible();
});

test('Library preserves its page through a preview and offers Previous after a failed read', async ({
  page,
  pilot,
}) => {
  await register(page, pilot.signupUrl);
  let failSecondPage = true;
  const secondSet = {
    id: '2',
    title: 'Philippine Nature',
    setKey: 'philippine-nature',
    description: 'A saved set.',
    publisherName: 'Revue',
    cardCount: 5,
    retired: false,
    saveAllowed: true,
  };
  await page.route('**/api/v1/me/saved-sets/2', (route) => route.fulfill({ json: secondSet }));
  await page.route(savedSetsPath, async (route) => {
    const secondPage = new URL(route.request().url()).searchParams.has('after');
    if (secondPage && failSecondPage) {
      await route.fulfill({ status: 503 });
      return;
    }
    await route.fulfill({
      json: {
        items: [
          secondPage ? secondSet : { ...secondSet, id: '1', title: 'Philippine History', setKey: 'philippine-history' },
        ],
        nextCursor: secondPage ? null : '1',
      },
    });
  });
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('alert')).toContainText('saved reviewers couldn’t load');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByRole('link', { name: 'Open Philippine History' })).toBeVisible();

  failSecondPage = false;
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('link', { name: 'Open Philippine Nature' }).click();
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  await page.getByRole('link', { name: 'Public preview: Philippine Nature' }).click();
  await expect(page).toHaveURL(/\/sets\/philippine-nature$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Philippine Nature' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Philippine Nature' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Library', exact: true }).click();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByRole('link', { name: 'Open Philippine History' })).toBeVisible();
});

test('Saved reviewers keep their place, preview return and blue identity in the stack and desktop grid', async ({
  page,
  pilot,
}) => {
  await register(page, pilot.signupUrl);
  const sets = Array.from({ length: 12 }, (_, index) => ({
    id: String(index + 1),
    title: index === 1 ? 'Philippine Nature' : `Study set ${index + 1}`,
    setKey: index === 1 ? 'philippine-nature' : 'philippine-history',
    cardCount: 5,
    description: 'Practice cards',
    publisherName: 'Revue',
    saveAllowed: true,
    retired: false,
    savedAt: '2026-11-15T00:00:00Z',
  }));
  await page.route(savedSetsPath, (route) => route.fulfill({ json: { items: sets, nextCursor: null } }));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Next reviewer: Philippine Nature' }).click();
  const selected = page.getByRole('link', { name: 'Open Philippine Nature' });
  await expect(selected.locator('.saved-set-icon')).toHaveCSS('color', 'rgb(24, 100, 171)');
  await selected.press('Enter');
  await page.getByRole('button', { name: 'Reviewer settings' }).click();
  await page.getByRole('link', { name: 'Public preview: Philippine Nature' }).click();
  await expect(page.getByRole('heading', { name: 'Philippine Nature' })).toBeVisible();
  await expect(page.locator('.saved-set-icon')).toHaveCSS('background-color', 'rgb(231, 245, 255)');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('link', { name: 'Back to Library', exact: true }).click();
  await expect(selected).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.collection-grid').getByRole('link')).toHaveCount(12);
  await expect(page.locator('.deck-carousel-stage')).toHaveCount(0);
  await expect(selected.locator('.saved-set-icon')).toHaveCSS('color', 'rgb(24, 100, 171)');
  await page.getByRole('button', { name: 'Stack', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next reviewer: Study set 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Next reviewer: Study set 3' }).click();
  const thirdSet = page.getByRole('link', { name: 'Open Study set 3', exact: true });
  await expect(thirdSet).toBeFocused();
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.locator('.deck-carousel-stage')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stack', exact: true }).click();
  await expect(page.locator('.deck-carousel-stage').getByRole('link', { name: 'Open Study set 3' })).toBeVisible();
});
