import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Browser, BrowserContext } from '@playwright/test';
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
  storage?: Storage;
};

test('reports cold mobile startup on simulated 3G', async ({ browser, pilot }, info) => {
  test.setTimeout(480_000);
  const learner = await seedLearner(browser, pilot.origin);
  const routes: Route[] = [
    { name: 'Home', path: '/', readySelector: 'main h1' },
    {
      name: 'Reviewer preview',
      path: '/sets/philippine-history',
      readySelector: '.set-detail-sample > p',
    },
    {
      name: 'Trial',
      path: '/sets/philippine-history/try',
      readySelector: '[data-card-frame] .review-front h2',
    },
    {
      name: 'Sign in',
      path: '/sign-in',
      readySelector: 'main input[type="password"]',
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
      readySelector: '[data-card-frame] .review-front h2',
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
        javascriptBytes: median(samples.map((sample) => sample.javascriptBytes)),
        profileRequests: median(samples.map((sample) => sample.profileRequests)),
        publicSessionRequests: median(samples.map((sample) => sample.publicSessionRequests)),
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

    const scripts = new Map<string, string>();
    const transfers: { path: string; bytes: number }[] = [];
    let profileRequests = 0;
    let publicSessionRequests = 0;
    cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
      const url = new URL(request.url);
      if (url.origin !== origin) return;
      if (url.pathname.endsWith('.js')) scripts.set(requestId, url.pathname);
      if (url.pathname === '/api/v1/me') profileRequests++;
      if (url.pathname === '/api/v1/auth/session') publicSessionRequests++;
    });
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      const path = scripts.get(requestId);
      if (path) transfers.push({ path, bytes: encodedDataLength });
    });

    await page.addInitScript((readySelector) => {
      new PerformanceObserver((list) => {
        const candidate = list.getEntries().at(-1);
        if (candidate) performance.mark('startup-lcp', { startTime: candidate.startTime });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      function markReady() {
        const marker = document.querySelector(readySelector);
        if (marker?.getClientRects().length && !marker.closest('[inert]')) performance.mark('startup-ready');
        else requestAnimationFrame(markReady);
      }
      requestAnimationFrame(markReady);
    }, route.readySelector);
    await page.goto(`${origin}${route.path}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => performance.getEntriesByName('startup-ready', 'mark').length > 0, undefined, {
      timeout: 20_000,
    });
    const startupScripts = transfers.slice();
    const javascriptBytes = startupScripts.reduce((bytes, script) => bytes + script.bytes, 0);
    const paints = await page.evaluate(async () => {
      await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2200))]);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        readyMs: Math.round(performance.getEntriesByName('startup-ready', 'mark')[0].startTime),
        firstPaintMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
        largestPaintMs: Math.round(performance.getEntriesByName('startup-lcp', 'mark').at(-1)?.startTime ?? 0),
      };
    });
    expect(paints.firstPaintMs, `${route.name} should record first contentful paint`).toBeGreaterThan(0);
    expect(paints.largestPaintMs, `${route.name} should record largest contentful paint`).toBeGreaterThan(0);
    return { ...paints, javascriptBytes, profileRequests, publicSessionRequests, scripts: startupScripts };
  } finally {
    await context.close();
  }
}

function median(values: number[]) {
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
}
