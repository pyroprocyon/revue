import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Browser, BrowserContext } from '@playwright/test';
import { historyCards, historySet } from '../src/test/fixtures';
import { expect, test } from './fixtures';

const profile = {
  viewport: { width: 375, height: 667 },
  latencyMs: 400,
  downloadBytesPerSecond: 50 * 1024,
  uploadBytesPerSecond: 50 * 1024,
  cpuSlowdown: 4,
  samplesPerRoute: 3,
};

type Storage = Awaited<ReturnType<BrowserContext['storageState']>>;
type Route = {
  name: string;
  path: string;
  readySelector: string;
  settledSelector?: string;
  storage?: Storage;
};

const homeRoute: Route = {
  name: 'Home',
  path: '/',
  readySelector: 'main h1',
  settledSelector: 'nav[aria-label="Account"] a[href="/join"]',
};
const reviewerPreviewRoute: Route = {
  name: 'Reviewer preview',
  path: '/sets/philippine-history',
  readySelector: '.set-detail-sample > p',
};
const saveablePreviewRoute: Route = {
  name: 'Saveable reviewer preview',
  path: '/sets/published-test-set',
  readySelector: '.set-detail-header h1',
  settledSelector: '.set-detail-study a[href^="/sign-in?returnTo="]',
};
const reviewCardHeading = '[data-card-frame] .review-front h2';

test('startup audit waits for Home account actions after the heading is ready', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/session', async (route) => {
    await pending;
    await route.fulfill({ json: { signedIn: false } });
  });
  await page.addInitScript(observeStartup, homeRoute);
  try {
    await page.goto(homeRoute.path);
    await page.waitForFunction(() => performance.getEntriesByName('startup-ready').length > 0);
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeHidden();
    expect(await page.evaluate(() => performance.getEntriesByName('startup-settled').length)).toBe(0);
    release();
    await page.waitForFunction(() => performance.getEntriesByName('startup-settled').length > 0);
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible();
  } finally {
    release();
  }
});

test('startup audit measures standalone loading feedback during review sign-in checks', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/me', async (route) => {
    await pending;
    await route.fulfill({ json: { username: 'startup_learner' } });
  });
  await page.route('**/api/v1/cards/due*', (route) =>
    route.fulfill({
      json: {
        totalCards: 1,
        availableCards: 1,
        dueCards: 1,
        newCards: 0,
        nextReviewDate: null,
        cards: [
          {
            ...historyCards.cards[0],
            id: '1',
            memoryHook: null,
            setTitle: historyCards.setTitle,
            publisherName: historyCards.publisherName,
            contentVersion: 1,
            version: 1,
          },
        ],
      },
    }),
  );
  await page.addInitScript(observeStartup, { readySelector: reviewCardHeading });
  try {
    await page.goto('/review/deck-1');
    await expect(page.getByText('Loading your account…')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse reviewers' })).toBeVisible();
    await expect(page.locator(reviewCardHeading)).toHaveCount(0);
    await page.waitForFunction(() => performance.getEntriesByName('startup-placeholder-on').length > 0);
    release();
    await page.waitForFunction(() => performance.getEntriesByName('startup-settled').length > 0);
    const visibleMs = await page.evaluate(() => {
      const start = performance.getEntriesByName('startup-placeholder-on')[0].startTime;
      const end = performance.getEntriesByName('startup-placeholder-off')[0].startTime;
      return end - start;
    });
    expect(visibleMs).toBeGreaterThan(0);
  } finally {
    release();
  }
});

test('Library startup stays unsettled until the saved reviewers finish loading', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'startup_learner' } }));
  await page.route('**/api/v1/decks', (route) =>
    route.fulfill({ json: { items: [{ id: '7', title: 'Biology notes', cardCount: 1, archived: false }] } }),
  );
  await page.route('**/api/v1/me/saved-sets?*', async (route) => {
    await pending;
    await route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.addInitScript(observeStartup, { readySelector: '.library-collections [href="/library/decks/7"]' });
  try {
    await page.goto('/library');
    await page.waitForFunction(() => performance.getEntriesByName('startup-ready').length > 0);
    await expect(page.getByRole('link', { name: 'Open Biology notes' })).toBeVisible();
    await expect(page.getByText('Loading saved reviewers…')).toBeVisible();
    expect(await page.evaluate(() => performance.getEntriesByName('startup-settled').length)).toBe(0);
    await page.waitForFunction(() => performance.getEntriesByName('startup-placeholder-on').length > 0);
    release();
    await page.waitForFunction(() => performance.getEntriesByName('startup-settled').length > 0);
    await expect(page.getByText('Loading saved reviewers…')).toBeHidden();
  } finally {
    release();
  }
});

function holdResponse() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pending, release };
}

for (const route of [
  {
    path: '/today',
    chunk: 'TodayOverview',
    readySelector: 'main h2',
    dataRequest: '**/api/v1/cards/due*',
    data: { totalCards: 0, availableCards: 0, dueCards: 0, newCards: 0, nextReviewDate: null, cards: [] },
  },
  {
    path: '/library',
    chunk: 'LibraryPage',
    readySelector: '.library-collections [href="/library/decks/7"]',
    dataRequest: '**/api/v1/decks',
    data: { items: [{ id: '7', title: 'Biology notes', cardCount: 1, archived: false }] },
  },
]) {
  test(`the ${route.path} placeholder stays visible through the code and data handoff`, async ({ page }) => {
    const code = holdResponse();
    const data = holdResponse();
    const today = route.path === '/today';
    const chunk = `**/assets/${route.chunk}-*.js`;
    await page.route('**/api/v1/me', (request) => request.fulfill({ json: { username: 'startup_learner' } }));
    await page.route(chunk, async (request) => {
      await code.pending;
      await request.continue();
    });
    if (!today) {
      await page.route('**/api/v1/me/saved-sets?*', (request) =>
        request.fulfill({ json: { items: [], nextCursor: null } }),
      );
    }
    await page.route(route.dataRequest, async (request) => {
      await data.pending;
      await request.fulfill({ json: route.data });
    });
    await page.addInitScript(observeStartup, route);
    try {
      await page.goto(route.path, { waitUntil: 'commit' });
      await page.waitForFunction(() => performance.getEntriesByName('startup-placeholder-on').length > 0);
      const firstResponse = page.waitForResponse(today ? route.dataRequest : chunk);
      (today ? data : code).release();
      expect((await firstResponse).ok()).toBe(true);
      await expect(
        page.waitForFunction(() => performance.getEntriesByName('startup-placeholder-off').length > 0, undefined, {
          timeout: 750,
        }),
      ).rejects.toThrow(/Timeout 750ms exceeded/);
      (today ? code : data).release();
      await page.waitForFunction(() => performance.getEntriesByName('startup-settled').length > 0);
      expect(await page.evaluate(() => performance.getEntriesByName('startup-placeholder-off').length)).toBe(1);
    } finally {
      code.release();
      data.release();
    }
  });
}

test('a saved reviewer keeps its loading feedback through details, browser code and cards', async ({ page }) => {
  const detail = holdResponse();
  const code = holdResponse();
  const cards = holdResponse();
  const detailRequest = '**/api/v1/me/saved-sets/1';
  const cardsRequest = '**/api/v1/me/saved-sets/1/cards';
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'startup_learner' } }));
  await page.route(detailRequest, async (route) => {
    await detail.pending;
    await route.fulfill({
      json: { ...historySet, id: '1', retired: false, saveAllowed: true, savedAt: '2026-11-15T00:00:00Z' },
    });
  });
  await page.route('**/assets/SavedSetBrowser-*.js', async (route) => {
    await code.pending;
    await route.continue();
  });
  await page.route(cardsRequest, async (route) => {
    await cards.pending;
    await route.fulfill({
      json: {
        deck: { id: '1', title: historySet.title, cardCount: 5, archived: false },
        progress: { dueCards: 0, newCards: 5, nextReviewDate: null },
        items: [{ id: '7', question: 'Who led the defense?', answer: 'Lapulapu', version: 1, contentVersion: 1 }],
        dueCardIds: [],
        nextCursor: null,
      },
    });
  });
  await page.addInitScript(observeStartup, { readySelector: '#saved-set-title' });
  try {
    const cardsStarted = page.waitForRequest(cardsRequest);
    await page.goto('/library?shelf=saved&set=1', { waitUntil: 'commit' });
    await cardsStarted;
    await expect(page.getByText('Loading the saved reviewer…')).toBeVisible();
    await page.waitForFunction(() => performance.getEntriesByName('startup-placeholder-on').length > 0);
    const detailLoaded = page.waitForResponse(detailRequest);
    detail.release();
    expect((await detailLoaded).ok()).toBe(true);
    await expect(
      page.waitForFunction(() => performance.getEntriesByName('startup-placeholder-off').length > 0, undefined, {
        timeout: 750,
      }),
    ).rejects.toThrow(/Timeout 750ms exceeded/);

    code.release();
    await expect(page.getByRole('heading', { name: historySet.title, exact: true })).toBeVisible();
    await expect(page.getByText('Loading cards…', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => performance.getEntriesByName('startup-settled').length)).toBe(0);
    cards.release();
    await page.waitForFunction(() => performance.getEntriesByName('startup-settled').length > 0);
    expect(await page.evaluate(() => performance.getEntriesByName('startup-placeholder-off').length)).toBe(1);
  } finally {
    detail.release();
    code.release();
    cards.release();
  }
});

test('reviewer preview stays unsettled until trial availability is known', async ({ page }) => {
  const availability = holdResponse();
  await page.route('**/api/v1/public-sets/philippine-history/demo-cards', async (route) => {
    await availability.pending;
    await route.fulfill({ status: 404 });
  });
  await page.addInitScript(observeStartup, reviewerPreviewRoute);
  try {
    await page.goto(reviewerPreviewRoute.path);
    const tryTrial = page.getByRole('link', { name: 'Try 5 cards', exact: true });
    await expect(tryTrial).toBeVisible();
    await page.waitForFunction(() => performance.getEntriesByName('startup-ready').length > 0);
    expect(await page.evaluate(() => performance.getEntriesByName('startup-settled').length)).toBe(0);
    availability.release();
    await expect(page.getByText('This trial is unavailable right now.', { exact: true })).toBeVisible();
    await expect(tryTrial).toHaveCount(0);
    await page.waitForFunction(() => performance.getEntriesByName('startup-settled').length > 0);
  } finally {
    availability.release();
  }
});

test('saveable reviewer startup waits for a usable save action after a failed membership read', async ({
  page,
  pilot,
}) => {
  pilot.addSaveableSet();
  await page.route('**/api/v1/sets/*/save', (route) => route.fulfill({ status: 500 }), { times: 1 });
  await page.addInitScript(observeStartup, saveablePreviewRoute);
  await page.goto(saveablePreviewRoute.path);
  await page.waitForFunction(() => performance.getEntriesByName('startup-ready').length > 0);
  await expect(page.getByText('Saved status couldn’t load.')).toBeVisible();
  expect(await page.evaluate(() => performance.getEntriesByName('startup-settled').length)).toBe(0);
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('link', { name: 'Sign in to save' })).toBeVisible();
  await page.waitForFunction(() => performance.getEntriesByName('startup-settled').length > 0);
});

test('reports cold mobile startup on simulated 3G', async ({ browser, pilot }, info) => {
  test.setTimeout(480_000);
  const learner = await seedLearner(browser, pilot.origin);
  pilot.addSaveableSet();
  const routes: Route[] = [
    homeRoute,
    reviewerPreviewRoute,
    saveablePreviewRoute,
    {
      name: 'Trial',
      path: '/sets/philippine-history/try',
      readySelector: reviewCardHeading,
    },
    {
      name: 'Sign in',
      path: '/sign-in',
      readySelector: 'main input[type="password"]',
      settledSelector: '#account-form button[type="submit"]:enabled',
    },
    {
      name: 'Today',
      path: '/today',
      storage: learner.storage,
      readySelector: 'main h2',
    },
    {
      name: 'Library',
      path: '/library',
      storage: learner.storage,
      readySelector: `.library-collections [href="${learner.deck}"]`,
    },
    {
      name: 'Deck',
      path: learner.deck,
      storage: learner.storage,
      readySelector: `main [href="${learner.review}"]`,
    },
    {
      name: 'Review',
      path: learner.review,
      storage: learner.storage,
      readySelector: reviewCardHeading,
    },
  ];

  const results = [];
  for (const route of routes) {
    const samples = await test.step(route.name, async () => {
      const runs = [];
      for (let run = 0; run < profile.samplesPerRoute; run++) {
        runs.push(await measureRoute(browser, pilot.origin, route));
      }
      return runs;
    });
    results.push({
      name: route.name,
      path: route.path,
      signedIn: Boolean(route.storage),
      median: {
        firstPaintMs: median(samples.map((sample) => sample.firstPaintMs)),
        largestPaintMs: median(samples.map((sample) => sample.largestPaintMs)),
        readyMs: median(samples.map((sample) => sample.readyMs)),
        settledMs: median(samples.map((sample) => sample.settledMs)),
        placeholderMs: median(samples.map((sample) => sample.placeholderMs)),
        layoutShiftTotal: median(samples.map((sample) => sample.layoutShiftTotal)),
        javascriptBytes: median(samples.map((sample) => sample.javascriptBytes)),
        styleBytes: median(samples.map((sample) => sample.styleBytes)),
        fontBytes: median(samples.map((sample) => sample.fontBytes)),
        profileRequests: median(samples.map((sample) => sample.profileRequests)),
        publicSessionRequests: median(samples.map((sample) => sample.publicSessionRequests)),
        studyQueueRequests: median(samples.map((sample) => sample.studyQueueRequests)),
      },
      samples,
    });
  }
  const destination = process.env.REVUE_STARTUP_REPORT_DIR;
  const report = destination ? resolve(destination, 'startup-3g.json') : info.outputPath('startup-3g.json');
  const reportDirectory = dirname(report);
  const temporaryReport = join(reportDirectory, `.startup-3g-${randomUUID()}.tmp`);
  await mkdir(reportDirectory, { recursive: true });
  try {
    await writeFile(
      temporaryReport,
      JSON.stringify({ browser: browser.version(), profile, routes: results }, null, 2) + '\n',
    );
    await rename(temporaryReport, report);
  } finally {
    await rm(temporaryReport, { force: true });
  }
  await info.attach('startup-3g', { path: report, contentType: 'application/json' });
  console.table(results.map(({ name, median }) => ({ route: name, ...median })));
  console.log(`3G report saved to ${report}`);
});

async function seedLearner(browser: Browser, origin: string) {
  const context = await browser.newContext({ viewport: profile.viewport });
  try {
    const page = await context.newPage();
    const password = randomUUID();
    await page.goto(`${origin}/register`);
    await page.getByLabel('Username', { exact: true }).fill(`perf_${randomUUID().slice(0, 12)}`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('link', { name: 'Create a deck', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Biology notes');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByLabel('Question', { exact: true }).fill('What is osmosis?');
    await page.getByLabel('Answer', { exact: true }).fill('Water crossing a membrane.');
    await page.getByRole('button', { name: 'Save card', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'New card' });
    await editor.getByRole('button', { name: 'Done', exact: true }).click();
    const review = await page.getByRole('link', { name: 'Start review', exact: true }).getAttribute('href');
    if (!review) throw new Error('Seeded deck is missing its review link');
    return { deck: new URL(page.url()).pathname, review, storage: await context.storageState() };
  } finally {
    await context.close();
  }
}

async function measureRoute(browser: Browser, origin: string, route: Route) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
    storageState: route.storage,
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latencyMs,
      downloadThroughput: profile.downloadBytesPerSecond,
      uploadThroughput: profile.uploadBytesPerSecond,
      connectionType: 'cellular3g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });

    const assets = new Map<string, string>();
    const transfers: { path: string; bytes: number }[] = [];
    let profileRequests = 0;
    let publicSessionRequests = 0;
    let studyQueueRequests = 0;
    cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
      const url = new URL(request.url);
      if (url.origin !== origin) return;
      if (/\.(js|css|woff2)$/.test(url.pathname)) assets.set(requestId, url.pathname);
      if (url.pathname === '/api/v1/me') profileRequests++;
      if (url.pathname === '/api/v1/auth/session') publicSessionRequests++;
      if (url.pathname === '/api/v1/cards/due') studyQueueRequests++;
    });
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      const path = assets.get(requestId);
      if (path) transfers.push({ path, bytes: encodedDataLength });
    });

    await page.addInitScript(observeStartup, {
      readySelector: route.readySelector,
      settledSelector: route.settledSelector,
    });
    await page.goto(`${origin}${route.path}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => performance.getEntriesByName('startup-ready', 'mark').length > 0, undefined, {
      timeout: 20_000,
    });
    const startupScripts = transfers.filter(({ path }) => path.endsWith('.js'));
    const javascriptBytes = startupScripts.reduce((bytes, script) => bytes + script.bytes, 0);
    await page.waitForFunction(() => performance.getEntriesByName('startup-settled', 'mark').length > 0, undefined, {
      timeout: 20_000,
    });
    const paints = await page.evaluate(async () => {
      await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2200))]);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const ready = performance.getEntriesByName('startup-ready', 'mark')[0].startTime;
      const settled = performance.getEntriesByName('startup-settled', 'mark')[0].startTime;
      const starts = performance.getEntriesByName('startup-placeholder-on', 'mark');
      const ends = performance.getEntriesByName('startup-placeholder-off', 'mark');
      return {
        readyMs: Math.round(ready),
        settledMs: Math.round(settled),
        placeholderMs: Math.round(starts.reduce((total, start, i) => total + (ends[i].startTime - start.startTime), 0)),
        layoutShiftTotal: performance
          .getEntriesByType('mark')
          .reduce(
            (total, entry) =>
              entry.name === 'startup-layout-shift' ? total + (entry as PerformanceMark).detail : total,
            0,
          ),
        firstPaintMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
        largestPaintMs: Math.round(performance.getEntriesByName('startup-lcp', 'mark').at(-1)?.startTime ?? 0),
      };
    });
    expect(paints.firstPaintMs, `${route.name} should record first contentful paint`).toBeGreaterThan(0);
    expect(paints.largestPaintMs, `${route.name} should record largest contentful paint`).toBeGreaterThan(0);
    return {
      ...paints,
      javascriptBytes,
      styleBytes: transferredBytes(transfers, '.css'),
      fontBytes: transferredBytes(transfers, '.woff2'),
      profileRequests,
      publicSessionRequests,
      studyQueueRequests,
      scripts: startupScripts,
    };
  } finally {
    await context.close();
  }
}

function observeStartup({ readySelector, settledSelector }: Pick<Route, 'readySelector' | 'settledSelector'>) {
  new PerformanceObserver((list) => {
    const candidate = list.getEntries().at(-1);
    if (candidate) performance.mark('startup-lcp', { startTime: candidate.startTime });
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) {
      if (!entry.hadRecentInput) performance.mark('startup-layout-shift', { detail: entry.value });
    }
  }).observe({ type: 'layout-shift', buffered: true });

  function hasVisibleElement(selector: string) {
    return Array.from(document.querySelectorAll(selector)).some(
      (element) =>
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility === 'visible' &&
        !element.closest('[inert]'),
    );
  }

  let ready = false;
  let loadingVisible = false;
  function sampleLoading() {
    const visible = hasVisibleElement('[data-loading-shape], [data-loading-indicator], .loading-status');
    if (visible !== loadingVisible) {
      performance.mark(visible ? 'startup-placeholder-on' : 'startup-placeholder-off');
      loadingVisible = visible;
    }
    if (!ready && hasVisibleElement(readySelector)) {
      performance.mark('startup-ready');
      ready = true;
    }
    if (
      ready &&
      !visible &&
      !document.querySelector('[data-loading-slot]') &&
      (!settledSelector || hasVisibleElement(settledSelector))
    ) {
      performance.mark('startup-settled');
    } else {
      requestAnimationFrame(sampleLoading);
    }
  }
  requestAnimationFrame(sampleLoading);
}

function transferredBytes(transfers: { path: string; bytes: number }[], extension: string) {
  return transfers.reduce((total, asset) => total + (asset.path.endsWith(extension) ? asset.bytes : 0), 0);
}

function median(values: number[]) {
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
}
