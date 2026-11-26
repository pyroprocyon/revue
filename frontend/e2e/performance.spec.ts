import { test, expect } from './fixtures';
import { historyCards } from '../src/test/fixtures';
import { SIGNED_IN_HINT_KEY } from '../src/shared/navigation/signedInHint';

test('a direct review starts downloading before the shared app finishes loading', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'true'), SIGNED_IN_HINT_KEY);
  let releaseShell!: () => void;
  const shell = new Promise<void>((resolve) => {
    releaseShell = resolve;
  });
  await page.route('**/assets/vendor-*.js', async (route) => {
    await shell;
    await route.continue();
  });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/me', async (route) => {
    await pending;
    await route.fulfill({ status: 401 });
  });
  const reviewCode = page.waitForEvent('response', (response) => /\/assets\/ReviewPage-.*\.js$/.test(response.url()));
  try {
    const [, chunk] = await Promise.all([page.goto('/review/deck-1', { waitUntil: 'commit' }), reviewCode]);
    expect(chunk.ok()).toBe(true);
    releaseShell();
    await expect(page.getByRole('link', { name: 'Finish for now' })).toBeVisible();
    await expect(page.locator('[data-card-frame]')).toHaveCount(0);
  } finally {
    releaseShell();
    release();
  }
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('a deck downloads its editor while the cards are loading', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'true'), SIGNED_IN_HINT_KEY);
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'startup_learner' } }));
  await page.route('**/api/v1/cards/due*', (route) =>
    route.fulfill({ json: { totalCards: 0, availableCards: 0, dueCards: 0, newCards: 0, cards: [] } }),
  );
  const editorFiles: string[] = [];
  const requests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/me' || path === '/api/v1/decks/7/cards') requests.push(path);
    if (/\/assets\/DeckContent-.*\.js$/.test(path)) {
      requests.push('view');
      editorFiles.push(path);
    }
  });
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Your review', exact: true })).toBeVisible();
  expect(editorFiles).toHaveLength(0);
  requests.length = 0;

  let releaseCards!: () => void;
  const cards = new Promise<void>((resolve) => {
    releaseCards = resolve;
  });
  await page.route('**/api/v1/decks/7/cards', async (route) => {
    await cards;
    await route.fulfill({ status: 503 });
  });
  try {
    await page.goto('/library/decks/7', { waitUntil: 'commit' });
    await expect(page.getByText('Loading your deck…')).toBeVisible();
    await expect.poll(() => editorFiles.length).toBe(1);
    expect(requests[0]).toBe('/api/v1/me');
    expect(requests.slice(1).sort()).toEqual(['/api/v1/decks/7/cards', 'view']);
  } finally {
    releaseCards();
  }
  await expect(page.getByRole('alert')).toHaveText('Your deck couldn’t load. Check your connection and try again.');
});

test('Library reads the selected shelf while its view code is still loading', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'true'), SIGNED_IN_HINT_KEY);
  const requests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/me' || path === '/api/v1/decks') requests.push(path);
    if (/\/assets\/LibraryPage-.*\.js$/.test(path)) requests.push('view');
  });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'startup_learner' } }));
  await page.route('**/api/v1/me/saved-sets?*', (route) => route.fulfill({ json: { items: [], nextCursor: null } }));
  let deckReads = 0;
  await page.route('**/api/v1/decks', (route) => {
    deckReads++;
    return route.fulfill({ json: { items: [{ id: '7', title: 'Cell Biology', cardCount: 1, archived: false }] } });
  });
  let release!: () => void;
  const view = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/LibraryPage-*.js', async (route) => {
    await view;
    await route.continue();
  });
  try {
    await page.goto('/library', { waitUntil: 'commit' });
    await expect.poll(() => deckReads).toBe(1);
    await expect(page.getByText('Loading your Library…')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Cell Biology' })).toHaveCount(0);
    expect(requests[0]).toBe('/api/v1/me');
    expect(requests.slice(1).sort()).toEqual(['/api/v1/decks', 'view']);
  } finally {
    release();
  }
  await expect(page.getByRole('link', { name: 'Open Cell Biology' })).toBeVisible();
  expect(deckReads).toBe(1);
});

test('a deck shows its cards before loading the editing and settings panels', async ({ page }) => {
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'startup_learner' } }));
  await page.route('**/api/v1/decks/7/cards', (route) =>
    route.fulfill({
      json: {
        deck: { id: '7', title: 'Cell Biology', cardCount: 1, archived: false },
        progress: { dueCards: 0, newCards: 1, nextReviewDate: null },
        items: [{ id: '71', version: 1, question: 'What is osmosis?', answer: 'Water crossing a membrane.' }],
        dueCardIds: [],
        nextCursor: null,
      },
    }),
  );
  const panels = new Set<string>();
  page.on('request', (request) => {
    const name = /\/assets\/(CardForm|DeckSettings)-[^/]+\.js$/.exec(new URL(request.url()).pathname)?.[1];
    if (name) panels.add(name);
  });
  await page.goto('/library/decks/7');
  await expect(page.getByRole('link', { name: 'Start review' })).toBeVisible();
  await expect(page.getByText('What is osmosis?', { exact: true })).toBeVisible();
  expect([...panels]).toEqual([]);
  await page.getByRole('button', { name: 'Deck settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Deck settings', exact: true })).toBeFocused();
  expect([...panels]).toEqual(['DeckSettings']);
  await page.getByRole('button', { name: 'Back to cards' }).click();
  let release!: () => void;
  const editor = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/CardForm-*.js', async (route) => {
    await editor;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New card', exact: true });
    await expect(dialog.getByText('Loading card editor…')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-card-row]').filter({ hasText: 'What is osmosis?' }).click();
    const edit = page.getByRole('button', { name: 'Edit card', exact: true });
    await edit.press('Enter');
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
    await cancel.press('Enter');
    await expect(edit).toBeFocused();
  } finally {
    release();
  }
});

test('a stale Library chunk reloads an open workspace on the requested route', async ({ page }) => {
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'startup_learner' } }));
  await page.route('**/api/v1/cards/due*', (route) =>
    route.fulfill({ json: { totalCards: 0, availableCards: 0, dueCards: 0, newCards: 0, cards: [] } }),
  );
  await page.route('**/api/v1/decks', (route) =>
    route.fulfill({ json: { items: [{ id: '7', title: 'Cell Biology', cardCount: 1, archived: false }] } }),
  );
  await page.route('**/api/v1/me/saved-sets?*', (route) => route.fulfill({ json: { items: [], nextCursor: null } }));
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Your review', exact: true })).toBeVisible();

  let reloadingLibrary = false;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && new URL(request.url()).pathname === '/library') reloadingLibrary = true;
  });
  await page.route('**/assets/LibraryPage-*.js', (route) =>
    reloadingLibrary ? route.continue() : route.fulfill({ status: 404 }),
  );
  const staleChunk = page.waitForResponse(
    (response) => /\/assets\/LibraryPage-.*\.js$/.test(response.url()) && response.status() === 404,
  );
  await page.getByRole('navigation', { name: 'Your workspace' }).getByRole('link', { name: 'Library' }).click();
  await staleChunk;
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('link', { name: /Cell Biology/ })).toBeVisible();
  expect(
    await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type),
  ).toBe('reload');
});

test('a slow account chunk keeps the workspace in place and a repeated failure offers manual retry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'startup_learner' } }));
  let failChunk!: () => void;
  const pending = new Promise<void>((resolve) => {
    failChunk = resolve;
  });
  await page.route('**/assets/AccountPage-*.js', async (route) => {
    await pending;
    await route.abort('failed');
  });
  let accountDocuments = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && new URL(request.url()).pathname === '/account') accountDocuments++;
  });
  const nav = page.getByRole('navigation', { name: 'Your workspace' });
  const heading = page.getByRole('heading', { name: 'Your account', exact: true });
  let loadingHeading: Awaited<ReturnType<typeof heading.boundingBox>>;
  try {
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    await expect(nav.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Loading this page…')).toBeVisible();
    loadingHeading = await heading.boundingBox();
  } finally {
    failChunk();
  }
  await expect(page.getByRole('heading', { name: 'Something went wrong', exact: true })).toBeFocused();
  expect(accountDocuments).toBe(2);
  await page.unroute('**/assets/AccountPage-*.js');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(heading).toBeFocused();
  const loadedHeading = (await heading.boundingBox())!;
  expect({ x: loadedHeading.x, y: loadedHeading.y }).toEqual({ x: loadingHeading!.x, y: loadingHeading!.y });
});

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
    await expect(page.locator('.library-collections')).toHaveCSS('animation-name', 'loading-reveal');
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

test('a slow direct trial keeps its exit in place while the first card loads', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/public-sets/philippine-history/demo-cards', async (route) => {
    await pending;
    await route.fulfill({ json: historyCards });
  });
  await page.goto('/sets/philippine-history/try');
  const exit = page.getByRole('button', { name: 'Exit trial' });
  const skeleton = page.locator('[data-loading-shape="study"] .loading-card');
  try {
    await expect(exit).toBeVisible();
    await expect(page.getByText('Loading the cards…')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const waitingPosition = await exit.boundingBox();
    const placeholder = (await skeleton.boundingBox())!;
    release();
    await expect(page.getByRole('heading', { name: 'Question 1?' })).toBeFocused();
    expect(await exit.boundingBox()).toEqual(waitingPosition);
    const card = (await page.locator('.review-card-frame').boundingBox())!;
    expect({ top: card.y, height: card.height }).toEqual({ top: placeholder.y, height: placeholder.height });
    await expect(page.getByText('Loading the cards…')).toHaveCount(0);
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
