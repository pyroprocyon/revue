import { test, expect } from './fixtures';

test('a slow tab keeps the header steady and fades in the content once it arrives', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'transition_learner' } }));
  await page.route('**/api/v1/me/saved-sets?*', (route) => route.fulfill({ json: { items: [], nextCursor: null } }));
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/decks', async (route) => {
    await pending;
    await route.fulfill({ json: { items: [{ id: '7', title: 'Cell Biology', cardCount: 6, archived: false }] } });
  });
  await page.goto('/account');
  await page.getByRole('heading', { name: 'Your account' }).waitFor();
  const nav = page.getByRole('navigation', { name: 'Your workspace' });
  const library = nav.getByRole('link', { name: 'Library' });
  try {
    await library.click();
    await expect(library).toHaveAttribute('aria-current', 'page');
    const heading = page.getByRole('heading', { name: 'Library' });
    await expect(heading).toBeFocused();
    await expect(page.locator('.workspace-page')).toHaveCSS('animation-name', 'none');
    await expect(page.getByText('Loading your Library…')).toBeVisible();
    await expect(page.getByText('Cell Biology', { exact: true })).toHaveCount(0);
    release();
    await expect(page.getByText('Cell Biology', { exact: true })).toBeVisible();
    await expect(page.locator('.library-collections')).toHaveCSS('animation-name', 'screen-enter');
    await expect(heading).toBeFocused();
    await expect(page.getByText('Loading your Library…')).toHaveCount(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await nav.getByRole('link', { name: 'Account' }).click();
    await library.click();
    await expect(page.getByText('Cell Biology', { exact: true })).toBeVisible();
    await expect(page.locator('.library-collections')).toHaveCSS('animation-name', 'none');
  } finally {
    release();
  }
});

test('the trial revalidates prefetched cards without downloading the same body twice', async ({ page, pilot }) => {
  const network = await page.context().newCDPSession(page);
  await network.send('Network.enable');
  const trials = new Set<string>();
  const statuses: { id: string; status: number }[] = [];
  network.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (request.url.endsWith('/demo-cards')) trials.add(requestId);
  });
  network.on('Network.responseReceivedExtraInfo', ({ requestId, statusCode }) => {
    statuses.push({ id: requestId, status: statusCode });
  });
  await page.goto(`${pilot.origin}/sets/philippine-history`);
  await expect
    .poll(() => statuses.filter((response) => trials.has(response.id)).map((response) => response.status))
    .toEqual([200]);
  await page.getByRole('link', { name: 'Try 5 cards', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible();
  await expect
    .poll(() => statuses.filter((response) => trials.has(response.id)).map((response) => response.status))
    .toEqual([200, 304]);
});

test('typing prepares one form token and signup rotates it before deck creation', async ({ page, pilot }) => {
  const tokenPath = '/api/v1/auth/csrf';
  let requests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === tokenPath) requests++;
  });
  await page.goto(pilot.signupUrl);
  const username = page.getByLabel('Username', { exact: true });
  await username.focus();
  expect(requests).toBe(0);
  await username.fill('form_' + crypto.randomUUID().slice(0, 12));
  await expect.poll(() => requests).toBe(1);
  const password = crypto.randomUUID();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('link', { name: 'Create a deck' }).click();
  const name = page.getByLabel('Name', { exact: true });
  await name.focus();
  expect(requests).toBe(1);
  await page.route('**' + tokenPath, (route) => route.fulfill({ status: 503 }), { times: 1 });
  const failedPreparation = page.waitForResponse((response) => new URL(response.url()).pathname === tokenPath);
  await name.fill('First draft');
  expect((await failedPreparation).status()).toBe(503);
  await name.fill('Exam prep');
  expect(requests).toBe(2);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();
  expect(requests).toBe(3);
});

for (const verification of ['succeeds', 'fails'] as const) {
  test(`signup keeps Today private while verification is pending and handles it when it ${verification}`, async ({
    page,
    pilot,
  }) => {
    const duePath = '/api/v1/cards/due';
    let dueRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === duePath) dueRequests++;
    });
    await page.goto(pilot.signupUrl);
    await page.getByLabel('Username', { exact: true }).fill('nav_' + crypto.randomUUID().slice(0, 12));
    const password = crypto.randomUUID();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);

    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      '**/api/v1/me',
      async (route) => {
        await pending;
        if (verification === 'succeeds') await route.continue();
        else await route.fulfill({ status: 503 });
      },
      { times: 1 },
    );
    try {
      const due = page.waitForResponse((response) => new URL(response.url()).pathname === duePath);
      await page.getByRole('button', { name: 'Create account' }).click();
      const response = await due;
      expect(response.status()).toBe(200);
      await response.finished();
      await expect(page.locator('a[href="/library/decks/new"]')).toHaveCount(0);
    } finally {
      release();
    }
    if (verification === 'fails') {
      await expect(page.getByRole('heading', { name: 'Your account couldn’t load' })).toBeVisible();
      await expect(page.locator('a[href="/library/decks/new"]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Try again' }).click();
    }
    await page.getByRole('link', { name: 'Create a deck' }).click();
    await expect(page.getByRole('textbox', { name: 'Name' })).toBeVisible();
    if (verification === 'succeeds') expect(dueRequests).toBe(1);
  });
}

test('signing in to Browse overlaps the subject index with account verification', async ({ page, pilot }) => {
  pilot.addSaveableSet();
  await page.goto(`${pilot.signupUrl}?returnTo=%2Fpublished`);
  await page.getByLabel('Username', { exact: true }).fill('browse_' + crypto.randomUUID().slice(0, 12));
  const password = crypto.randomUUID();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    '**/api/v1/me',
    async (route) => {
      await pending;
      await route.continue();
    },
    { times: 1 },
  );
  const subjectPath = '/api/v1/public-sets/catalog/subjects';
  let subjectReads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === subjectPath) subjectReads++;
  });
  try {
    const subjects = page.waitForResponse((response) => new URL(response.url()).pathname === subjectPath);
    await page.getByRole('button', { name: 'Create account' }).click();
    expect((await subjects).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Reviewers' })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole('link', { name: 'Open History' })).toBeVisible();
  expect(subjectReads).toBe(1);
});
