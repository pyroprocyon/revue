import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { PublicSet } from '../src/features/catalog/application/publicContent';
import { historyCards, historySet, natureSet } from '../src/test/fixtures';

function holdResponse() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}

async function mockReviewers(page: Page, reviewers: (PublicSet & { subject: string })[]) {
  const subjects = new Map<string, PublicSet[]>();
  for (const reviewer of reviewers) {
    const topics = subjects.get(reviewer.subject) ?? [];
    topics.push(reviewer);
    subjects.set(reviewer.subject, topics);
  }
  await page.route('**/api/v1/public-sets/catalog/subjects', (route) =>
    route.fulfill({ json: Array.from(subjects, ([subject, topics]) => ({ subject, topicCount: topics.length })) }),
  );
  await page.route('**/api/v1/public-sets?published=true*', (route) => {
    const subject = new URL(route.request().url()).searchParams.get('subject');
    expect(subject).not.toBeNull();
    return route.fulfill({ json: subjects.get(subject ?? '') ?? [] });
  });
}

test('a fresh reviewer link uses its published summary once', async ({ page, pilot }) => {
  const { setKey, shareCode, title, description, sampleQuestion } = (await (
    await page.request.get(`${pilot.origin}/api/v1/public-sets/philippine-history`)
  ).json()) as PublicSet;
  const summaryReads: string[] = [];
  const summaryPaths = [`/api/v1/public-sets/${setKey}`, `/api/v1/public-sets/share/${shareCode}/summary`];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (summaryPaths.includes(path)) summaryReads.push(path);
  });
  await page.route('**/demo-cards', (route) => route.abort());
  for (const path of [`/s/${shareCode}`, `/sets/${setKey}`]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', description);
    await expect(page.locator('.set-detail-sample > p')).toHaveText(sampleQuestion!);
    await expect(page.locator('meta[name="revue:reviewer"]')).toHaveCount(0);
    expect(summaryReads).toEqual([]);
  }
});

async function openHistoryFromReviewers(page: Page) {
  await page.goto('/sets');
  await page.getByRole('link', { name: /^Philippine History/ }).click();
}

test('Sign in to save opens the form when membership rejects a recent session', async ({ page }) => {
  const reviewer = { ...historySet, subject: 'History', saveAllowed: true };
  await mockReviewers(page, [reviewer]);
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'catalog_learner' } }));
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: { signedIn: false } }));
  await page.route('**/api/v1/public-sets/philippine-history', (route) => route.fulfill({ json: reviewer }));
  await page.route('**/api/v1/sets/1/save', (route) => route.fulfill({ status: 401 }));

  await page.goto('/published?subject=History');
  await page.locator('a[href="/sets/philippine-history"]').filter({ visible: true }).first().click();
  await page.getByRole('link', { name: 'Sign in to save' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fsets%2Fphilippine-history$/);
});

for (const [method, notification] of [
  ['GET', 'broadcast'],
  ['POST', 'broadcast'],
  ['POST', 'delayed storage event'],
] as const) {
  test(`an older ${method} 401 cannot replace a sign-in announced by ${notification}`, async ({ page, context }) => {
    const storageEvent = notification === 'delayed storage event';
    const otherTab = storageEvent ? await context.newPage() : undefined;
    if (storageEvent) {
      await otherTab!.route('**/session-change-fixture', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }),
      );
      await otherTab!.goto('/session-change-fixture');
      await page.addInitScript(() => {
        window.addEventListener('storage', function holdRevision(event) {
          if (event.key !== 'revue.session-revision') return;
          event.stopImmediatePropagation();
          window.removeEventListener('storage', holdRevision);
          window.addEventListener('release-session-change', () => dispatchEvent(new StorageEvent('storage', event)), {
            once: true,
          });
          document.documentElement.dataset.sessionChange = 'held';
        });
      });
      await page.route('**/api/v1/public-sets/catalog/onboarding', (route) => route.fulfill({ json: [historySet] }));
    } else {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Storage blocked', 'SecurityError');
          },
        });
      });
    }
    let rejectOldRequest!: () => void;
    const oldRequest = new Promise<void>((resolve) => {
      rejectOldRequest = resolve;
    });
    let markOldRequestIntercepted!: () => void;
    const oldRequestIntercepted = new Promise<void>((resolve) => {
      markOldRequestIntercepted = resolve;
    });
    let signedIn = method === 'POST';
    let learner = 'old_learner';
    let saved = false;
    let intercepted = false;
    await page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: { signedIn } }));
    await page.route('**/api/v1/auth/csrf', (route) =>
      route.fulfill({ json: { token: learner, headerName: 'X-XSRF-TOKEN', username: learner } }),
    );
    await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'new_learner' } }));
    await page.route('**/api/v1/public-sets/philippine-history', (route) =>
      route.fulfill({ json: { ...historySet, saveAllowed: true } }),
    );
    await page.route('**/api/v1/sets/1/save', async (route) => {
      if (!intercepted && route.request().method() === method) {
        intercepted = true;
        markOldRequestIntercepted();
        await oldRequest;
        await route.fulfill({ status: 401 });
      } else if (route.request().method() === 'POST') {
        saved = route.request().headers()['x-xsrf-token'] === learner;
        await route.fulfill({ status: saved ? 200 : 403, json: {} });
      } else {
        await route.fulfill({ json: { saved } });
      }
    });
    const save = page.getByRole('button', { name: 'Save to Library' });
    try {
      const initial = page.waitForResponse('**/api/v1/auth/session');
      await openHistoryFromReviewers(page);
      await initial;
      if (method === 'POST') await save.click();
      await oldRequestIntercepted;

      signedIn = true;
      learner = 'new_learner';
      if (otherTab) {
        await otherTab.evaluate(() => localStorage.setItem('revue.session-revision', 'new_learner'));
        await expect(page.locator('html')).toHaveAttribute('data-session-change', 'held');
        await page.getByRole('link', { name: 'All reviewers' }).click();
        await page.getByRole('link', { name: /^Philippine History/ }).click();
        await expect(save).toBeEnabled();
        await page.evaluate(() => dispatchEvent(new Event('release-session-change')));
      } else {
        const verified = page.waitForResponse('**/api/v1/auth/session');
        await page.evaluate(() => {
          const channel = new BroadcastChannel('revue.session-revision');
          channel.postMessage('changed');
          channel.close();
        });
        expect(await (await verified).json()).toEqual({ signedIn: true });
      }
      const rejected = page.waitForResponse(
        (response) => response.url().endsWith('/sets/1/save') && response.status() === 401,
      );
      rejectOldRequest();
      await rejected;
      await expect(save).toBeEnabled();
      if (method === 'POST') {
        const newSave = page.waitForResponse(
          (response) => response.url().endsWith('/sets/1/save') && response.request().method() === 'POST',
        );
        await save.click();
        expect((await newSave).status()).toBe(200);
        await expect(page.getByText('Saved to your Library')).toBeVisible();
      }
      await page.getByRole('link', { name: 'Revue', exact: true }).click();
      await expect(page).toHaveURL(/\/today$/);
    } finally {
      rejectOldRequest();
      await otherTab?.close();
    }
  });
}

for (const returnOldCards of ['before the summary', 'after opening the trial']) {
  test(`a trial replaces conflicting cards returned ${returnOldCards}`, async ({ page }) => {
    const path = '**/api/v1/public-sets/philippine-history';
    const summary = holdResponse();
    const oldCards = holdResponse();
    const firstReadStarted = holdResponse();
    const question = 'The updated first question?';
    const updatedCards = [{ ...historyCards.cards[0]!, question }, ...historyCards.cards.slice(1)];
    let reads = 0;
    await page.route('**/api/v1/public-sets/catalog/onboarding', (route) => route.fulfill({ json: [historySet] }));
    await page.route(path, async (route) => {
      await summary.ready;
      await route.fulfill({ json: { ...historySet, sampleQuestion: question } });
    });
    await page.route(`${path}/demo-cards`, async (route) => {
      reads += 1;
      if (reads === 1) {
        firstReadStarted.release();
        await oldCards.ready;
        await route.fulfill({ json: historyCards });
      } else {
        await route.fulfill({ json: { ...historyCards, cards: updatedCards } });
      }
    });

    try {
      await page.goto('/sets');
      await page.getByRole('link', { name: /^Philippine History/ }).click();
      await firstReadStarted.ready;
      if (returnOldCards === 'before the summary') {
        oldCards.release();
        await expect(page.getByText(historyCards.cards[0]!.question)).toBeVisible();
      }
      summary.release();
      const tryLink = page.getByRole('link', { name: 'Try 5 cards' });
      await expect(page.getByText(question, { exact: true })).toBeVisible();
      await tryLink.click();
      await expect(page).toHaveURL(/\/try$/);
      oldCards.release();
      await expect(page.getByRole('heading', { name: question })).toBeVisible();
    } finally {
      summary.release();
      oldCards.release();
    }
  });
}

for (const oldStatus of [404, 500]) {
  test(`a restored trial rechecks after an earlier card request returns ${oldStatus}`, async ({ page }) => {
    const path = '**/api/v1/public-sets/philippine-history';
    const summary = holdResponse();
    const oldWithdrawal = holdResponse();
    const restoredCards = holdResponse();
    let reads = 0;
    const question = historyCards.cards[0]!.question;
    await page.route('**/api/v1/public-sets/catalog/onboarding', (route) => route.fulfill({ json: [historySet] }));
    await page.route(path, async (route) => {
      await summary.ready;
      await route.fulfill({ json: { ...historySet, title: 'Detailed preview', sampleQuestion: question } });
    });
    await page.route(`${path}/demo-cards`, async (route) => {
      const read = ++reads;
      if (read === 2) await oldWithdrawal.ready;
      if (read <= 2) {
        await route.fulfill({ status: read === 1 ? 404 : oldStatus });
        return;
      }
      await restoredCards.ready;
      await route.fulfill({ json: historyCards });
    });

    try {
      await page.goto('/sets');
      const preview = page.getByRole('link', { name: /^Philippine History/ });
      const disabledTry = page.getByRole('button', { name: 'Try 5 cards' });
      await preview.click();
      await expect(disabledTry).toBeDisabled();
      await page.goBack();
      await preview.click();
      await expect.poll(() => reads).toBe(2);
      summary.release();
      await expect(page.getByRole('heading', { name: 'Detailed preview' })).toBeVisible();
      await expect(disabledTry).toBeDisabled();
      oldWithdrawal.release();
      await expect.poll(() => reads).toBe(3);
      await expect(disabledTry).toBeDisabled();
      restoredCards.release();
      await expect(page.getByText(question, { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Try 5 cards' }).click();
      await expect(page.getByRole('heading', { name: question })).toBeVisible();
    } finally {
      summary.release();
      oldWithdrawal.release();
      restoredCards.release();
    }
  });
}

for (const withdrawal of ['an unavailable summary', 'a missing reviewer']) {
  test(`Forward waits for fresh cards after the preview reports ${withdrawal}`, async ({ page }) => {
    const path = '**/api/v1/public-sets/philippine-history';
    const updatedTrial = holdResponse();
    const latestTrial = holdResponse();
    const question = 'The updated first question?';
    const cards = [{ ...historyCards.cards[0]!, question }, ...historyCards.cards.slice(1)];
    let reads = 0;
    let withdrawn = false;
    await page.route(path, (route) => {
      if (withdrawn && withdrawal === 'a missing reviewer') return route.fulfill({ status: 404 });
      return route.fulfill({
        json: {
          ...historySet,
          title: withdrawn ? 'Withdrawn reviewer' : historySet.title,
          trialAvailable: !withdrawn,
          cardCount: withdrawn ? 4 : historySet.cardCount,
          sampleQuestion: withdrawn ? undefined : question,
        },
      });
    });
    await page.route(`${path}/demo-cards`, async (route) => {
      const read = ++reads;
      if (read === 1) return route.fulfill({ json: historyCards });
      if (read === 2) {
        await updatedTrial.ready;
        return route.fulfill({ json: { ...historyCards, cards } });
      }
      await latestTrial.ready;
      return route.fulfill({ status: 404 });
    });

    try {
      await page.goto('/sets/philippine-history/try');
      await expect(page.getByRole('heading', { name: historyCards.cards[0]!.question })).toBeVisible();
      await page.getByRole('button', { name: 'Exit trial' }).click();
      await expect(page.getByText(question, { exact: true })).toBeVisible();
      await expect.poll(() => reads).toBe(2);
      await page.getByRole('link', { name: 'Try 5 cards' }).click();
      updatedTrial.release();
      await expect(page.getByRole('heading', { name: question })).toBeVisible();

      withdrawn = true;
      await page.goBack();
      if (withdrawal === 'a missing reviewer') {
        await expect(page.getByRole('heading', { name: "This reviewer isn't available right now." })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Withdrawn reviewer' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Try 5 cards' })).toBeDisabled();
      }
      await page.goForward();
      await expect(page).toHaveURL(/\/try$/);
      await expect(page.getByText('Loading the cards…')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Show answer' })).toHaveCount(0);
      latestTrial.release();
      await expect(page.getByRole('heading', { name: "The 5-card trial isn't available right now." })).toBeVisible();
    } finally {
      updatedTrial.release();
      latestTrial.release();
    }
  });
}

test('a delayed summary cannot re-enable a trial withdrawn during the same preview', async ({ page }) => {
  const path = '**/api/v1/public-sets/philippine-history';
  let releaseSummary!: () => void;
  const summary = new Promise<void>((resolve) => {
    releaseSummary = resolve;
  });
  await page.route('**/api/v1/public-sets/catalog/onboarding', (route) => route.fulfill({ json: [historySet] }));
  await page.route(path, async (route) => {
    await summary;
    await route.fulfill({
      json: { ...historySet, title: 'Detailed preview', sampleQuestion: 'A withdrawn question?' },
    });
  });
  await page.route(`${path}/demo-cards`, (route) => route.fulfill({ status: 404 }));

  try {
    await page.goto('/sets');
    await page.getByRole('link', { name: /^Philippine History/ }).click();
    await expect(page.getByRole('button', { name: 'Try 5 cards' })).toBeDisabled();
    releaseSummary();
    await expect(page.getByRole('heading', { name: 'Detailed preview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try 5 cards' })).toBeDisabled();
    await expect(page.getByText('A withdrawn question?')).toHaveCount(0);
  } finally {
    releaseSummary();
  }
});

test('a successful trial opens after the device clock moves backward', async ({ page }) => {
  const path = '**/api/v1/public-sets/philippine-history';
  await page.clock.setFixedTime(new Date('2026-01-15T12:00:00Z'));
  let releaseCards!: () => void;
  const cards = new Promise<void>((resolve) => {
    releaseCards = resolve;
  });
  await page.route(path, (route) => route.fulfill({ json: { ...historySet, sampleQuestion: 'Preview question?' } }));
  await page.route(`${path}/demo-cards`, async (route) => {
    await cards;
    await route.fulfill({ json: historyCards });
  });

  try {
    await openHistoryFromReviewers(page);
    await expect(page.getByText('Preview question?')).toBeVisible();
    await page.clock.setFixedTime(new Date('2026-01-15T11:55:00Z'));
    await page.getByRole('link', { name: 'Try 5 cards' }).click();
    releaseCards();
    const question = page.getByRole('heading', { name: historyCards.cards[0]!.question });
    await expect(question).toBeVisible();
    await page.reload();
    await expect(question).toBeVisible();
  } finally {
    releaseCards();
  }
});

test('a slow preview keeps its sample label and study actions in place', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  let showSample!: () => void;
  let showMembership!: () => void;
  const sampleResponse = new Promise<void>((resolve) => {
    showSample = resolve;
  });
  const membershipResponse = new Promise<void>((resolve) => {
    showMembership = resolve;
  });
  await page.route('**/api/v1/public-sets/philippine-history', (route) =>
    route.fulfill({ json: { ...historySet, saveAllowed: true } }),
  );
  await page.route('**/api/v1/public-sets/philippine-history/demo-cards', async (route) => {
    await sampleResponse;
    await route.fulfill({ json: historyCards });
  });
  await page.route('**/api/v1/sets/1/save', async (route) => {
    await membershipResponse;
    await route.fulfill({ json: { saved: false } });
  });
  const sample = page.getByRole('heading', { name: 'Sample question' });
  const actions = page.getByRole('group', { name: 'Reviewer actions' });
  const trial = actions.getByRole('link', { name: 'Try 5 cards' });
  const save = actions.getByRole('button', { name: 'Save to Library' });
  try {
    await openHistoryFromReviewers(page);
    await expect(trial).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const initialActions = await actions.boundingBox();
    await page.clock.fastForward(400);
    await expect(sample).toBeVisible();
    await expect(save).toHaveCount(0);
    const initialSample = await sample.boundingBox();
    expect(await actions.boundingBox()).toEqual(initialActions);

    showSample();
    await expect(page.getByText(historyCards.cards[0]!.question, { exact: true })).toBeVisible();
    expect(await sample.boundingBox()).toEqual(initialSample);
    expect(await actions.boundingBox()).toEqual(initialActions);

    showMembership();
    await expect(save).toBeEnabled();
    expect(await actions.boundingBox()).toEqual(initialActions);
  } finally {
    showSample();
    showMembership();
  }
});

test('the public list shows exactly the three onboarding reviewers across previews and reloads', async ({
  page,
  pilot,
}) => {
  pilot.addSaveableSet();
  await page.goto('/sets');
  const reviewers = page.getByRole('main').getByRole('list').getByRole('link');
  const links = ['/sets/philippine-history', '/sets/philippine-nature', '/sets/weather-and-disasters'];
  const hrefs = () => reviewers.evaluateAll((items) => items.map((item) => item.getAttribute('href')));
  await expect.poll(hrefs).toEqual(links);

  await reviewers.getByText('Philippine Nature', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Philippine Nature', exact: true })).toBeVisible();
  await page.goBack();
  await expect.poll(hrefs).toEqual(links);
  await page.reload();
  await expect.poll(hrefs).toEqual(links);

  await page.goto('/sets/published-test-set');
  await expect(page.getByRole('heading', { name: 'Published test set', exact: true })).toBeVisible();
});

for (const layout of ['grid', 'stack'] as const) {
  test(`returning to a topic ${layout} restores selection and scroll before the first rendered frame`, async ({
    page,
  }) => {
    const reviewers = Array.from({ length: 20 }, (_, index) => ({
      ...natureSet,
      setKey: `biology-${index}`,
      title: `Biology reviewer ${index}`,
      subject: 'Biology',
    }));
    await page.setViewportSize(layout === 'grid' ? { width: 1280, height: 800 } : { width: 390, height: 844 });
    await page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: { signedIn: true } }));
    await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'catalog_learner' } }));
    await mockReviewers(page, reviewers);
    await page.route('**/api/v1/public-sets/biology-17', (route) => route.fulfill({ json: reviewers[17] }));
    await page.goto('/published?subject=Biology');
    await expect(page.getByRole('heading', { level: 1, name: 'Biology' })).toBeVisible();
    const topic = page.getByRole('link', { name: 'Open Biology reviewer 17', exact: true });
    if (layout === 'stack') {
      const first = page.getByRole('link', { name: 'Open Biology reviewer 0', exact: true });
      await expect(first).toBeVisible();
      await first.focus();
      for (let index = 1; index <= 17; index++) {
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('link', { name: `Open Biology reviewer ${index}`, exact: true })).toBeFocused();
      }
    } else {
      await topic.scrollIntoViewIfNeeded();
    }
    const position = await page.evaluate(() => scrollY);
    if (layout === 'grid') {
      expect(position).toBeGreaterThan(200);
      await topic.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('heading', { name: 'Biology reviewer 17' })).toBeVisible();

    const firstCatalogFrame = page.evaluate(
      () =>
        new Promise<{ scrollY: number; focused: boolean; paused: boolean }>((resolve) => {
          function observeFrame() {
            const topicLink = document.querySelector('a[data-library-deck="biology-17"]');
            if (topicLink)
              resolve({
                scrollY,
                focused: topicLink === document.activeElement,
                paused: topicLink.closest('[inert]') !== null,
              });
            else requestAnimationFrame(observeFrame);
          }
          requestAnimationFrame(observeFrame);
        }),
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const restored = await firstCatalogFrame;
    expect(Math.abs(restored.scrollY - position)).toBeLessThanOrEqual(1);
    if (!restored.paused) expect(restored.focused).toBe(true);
    await expect(topic).toBeFocused();
  });
}

for (const layout of ['desktop grid', 'desktop stack', 'phone stack'] as const) {
  for (const moveFocus of [false, true]) {
    test(`retiring a restored topic in ${layout} keeps focus usable (focus moved: ${moveFocus})`, async ({ page }) => {
      const retired = { ...natureSet, setKey: 'retired-topic', title: 'Retired topic', subject: 'Biology' };
      const remaining = { ...natureSet, setKey: 'remaining-topic', title: 'Remaining topic', subject: 'Biology' };
      let finishRefresh!: () => void;
      const refreshing = new Promise<void>((resolve) => {
        finishRefresh = resolve;
      });
      let requests = 0;
      await page.setViewportSize({ width: layout === 'phone stack' ? 390 : 1280, height: 844 });
      await page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: { signedIn: true } }));
      await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'catalog_learner' } }));
      await mockReviewers(page, [retired, remaining]);
      await page.route('**/api/v1/public-sets?published=true*', async (route) => {
        if (++requests === 1) return route.fulfill({ json: [retired, remaining] });
        await refreshing;
        return route.fulfill({ json: [remaining] });
      });
      await page.route('**/api/v1/public-sets/retired-topic', (route) => route.fulfill({ json: retired }));
      const start = Date.now();
      await page.clock.setFixedTime(start);
      const view = layout === 'desktop stack' ? '&view=stack' : '';
      await page.goto(`/published?subject=Biology${view}`);
      const topics = page.getByRole(layout === 'desktop grid' ? 'list' : 'region', { name: 'Topics' });
      const retiredLink = topics.getByRole('link', { name: 'Open Retired topic' });
      await retiredLink.click();
      await expect(page.getByRole('heading', { name: 'Retired topic', exact: true })).toBeVisible();
      await page.clock.setFixedTime(start + 61_000);
      await page.getByRole('button', { name: 'Back', exact: true }).click();

      const search = page.getByRole('searchbox', { name: 'Search topics' });
      try {
        await expect(retiredLink).toBeFocused();
        if (moveFocus) await search.focus();
      } finally {
        finishRefresh();
      }
      await expect(retiredLink).toHaveCount(0);
      await expect(moveFocus ? search : topics.getByRole('link', { name: 'Open Remaining topic' })).toBeFocused();
    });
  }
}

for (const layout of ['desktop stack', 'phone stack'] as const) {
  for (const focus of ['opened topic', 'Search', 'next topic'] as const) {
    test(`retiring an earlier topic in ${layout} preserves selection and focus on ${focus}`, async ({ page }) => {
      const reviewers = ['Anatomy', 'Botany', 'Cells', 'DNA'].map((title) => ({
        ...natureSet,
        setKey: title.toLowerCase(),
        title,
        subject: 'Biology',
      }));
      let finishRefresh!: () => void;
      const refreshing = new Promise<void>((resolve) => {
        finishRefresh = resolve;
      });
      let requests = 0;
      await page.setViewportSize({ width: layout === 'phone stack' ? 390 : 1280, height: 844 });
      await page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: { signedIn: true } }));
      await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'catalog_learner' } }));
      await mockReviewers(page, reviewers);
      await page.route('**/api/v1/public-sets?published=true*', async (route) => {
        if (++requests === 1) return route.fulfill({ json: reviewers });
        await refreshing;
        return route.fulfill({ json: reviewers.slice(1) });
      });
      await page.route('**/api/v1/public-sets/botany', (route) => route.fulfill({ json: reviewers[1] }));
      const start = Date.now();
      await page.clock.setFixedTime(start);
      const view = layout === 'desktop stack' ? '&view=stack' : '';
      await page.goto(`/published?subject=Biology${view}`);
      const topics = page.getByRole('region', { name: 'Topics' });
      const botany = topics.getByRole('link', { name: 'Open Botany', exact: true });
      const cells = topics.getByRole('link', { name: 'Open Cells', exact: true });
      const search = page.getByRole('searchbox', { name: 'Search topics' });
      await topics.getByRole('link', { name: 'Open Anatomy', exact: true }).focus();
      await page.keyboard.press('ArrowDown');
      await expect(botany).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Botany', exact: true, level: 1 })).toBeVisible();
      await page.clock.setFixedTime(start + 61_000);
      await page.getByRole('button', { name: 'Back', exact: true }).click();

      try {
        await expect(botany).toBeFocused();
        await expect(topics.getByText('Anatomy', { exact: true }).first()).toBeAttached();
        if (focus === 'Search') await search.focus();
        if (focus === 'next topic') {
          await page.keyboard.press('ArrowDown');
          await expect(cells).toBeFocused();
        }
      } finally {
        finishRefresh();
      }
      const selected = focus === 'next topic' ? cells : botany;
      await expect(topics.getByText('Anatomy', { exact: true })).toHaveCount(0);
      await expect(selected).toBeInViewport();
      await expect(focus === 'Search' ? search : selected).toBeFocused();
      if (focus !== 'Search') {
        await page.keyboard.press('ArrowDown');
        const nextTopic = focus === 'next topic' ? 'DNA' : 'Cells';
        await expect(topics.getByRole('link', { name: `Open ${nextTopic}` })).toBeFocused();
      }
    });
  }
}

test('the phone topic stack follows the visible snap when selection observations are delayed', async ({ page }) => {
  const titles = ['Bugtong-Bugtong', 'Defense Mo Bukas', 'Gets Mo Ba Yung Chat?', 'Hulaan ang Kanta', 'Ikaw ang Ref!'];
  await page.setViewportSize({ width: 412, height: 768 });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'catalog_learner' } }));
  await mockReviewers(
    page,
    titles.map((title, index) => ({ ...historySet, title, setKey: `topic-${index}`, subject: 'Pinoy Tambayan' })),
  );
  await page.addInitScript(() => {
    const Observer = window.IntersectionObserver;
    window.IntersectionObserver = class extends Observer {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super((entries, observer) => {
          if (options?.root instanceof Element && options.root.hasAttribute('data-delay-selection')) return;
          callback(entries, observer);
        }, options);
      }
    };
  });
  await page.goto('/published?subject=Pinoy+Tambayan');
  const topics = page.getByRole('region', { name: 'Topics' });
  const scroller = topics.locator('.deck-carousel-scroller');
  await expect(topics.getByRole('link', { name: 'Open Bugtong-Bugtong' })).toBeVisible();
  const scrollToTopic = (index: number, delaySelection: boolean) =>
    scroller.evaluate(
      (element, options) => {
        const step = element.querySelector('.deck-carousel-snap-points > div')!.getBoundingClientRect().height;
        element.toggleAttribute('data-delay-selection', options.delaySelection);
        element.scrollTo({ top: options.index * step, behavior: 'instant' });
      },
      { index, delaySelection },
    );
  await scrollToTopic(2, false);
  await expect(topics.getByRole('link', { name: 'Open Gets Mo Ba Yung Chat?' })).toBeVisible();
  await scrollToTopic(3, true);
  const next = topics.getByRole('link', { name: 'Open Hulaan ang Kanta' });
  await expect(next.getByRole('heading')).toBeInViewport({ ratio: 1 });
  await expect(topics.getByRole('button', { name: 'Next topic: Ikaw ang Ref!' })).toBeInViewport({ ratio: 1 });
});

test('the subject stack reaches every subject and counts topics only on the front card', async ({ page }) => {
  const reviewers = Array.from({ length: 12 }, (_, index) => ({
    ...natureSet,
    setKey: `topic-${index}`,
    title: `Topic ${index}`,
    subject: `Subject ${String(index).padStart(2, '0')}`,
  }));
  reviewers.push({ ...reviewers[0], setKey: 'second-topic', title: 'A second topic' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: { signedIn: true } }));
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'catalog_learner' } }));
  await mockReviewers(page, reviewers);
  await page.goto('/published');

  const stack = page.getByRole('region', { name: 'Subjects' });
  const first = stack.getByRole('link', { name: 'Open Subject 00' });
  await expect(first).toHaveAccessibleDescription('2 topics');
  await expect(stack.getByText(/^\d+ topics?$/)).toHaveCount(1);
  await expect(stack.getByText(/of 12/)).toHaveCount(0);

  await first.focus();
  for (let number = 1; number < 12; number += 1) {
    await page.keyboard.press('ArrowDown');
    const subject = stack.getByRole('link', { name: `Open Subject ${String(number).padStart(2, '0')}` });
    await expect(subject).toBeFocused();
    await expect(subject).toHaveAccessibleDescription('1 topic');
  }
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: /Topic 11/ })).toBeVisible();
  await page.getByRole('link', { name: 'Reviewers', exact: true }).click();
  await expect(stack.getByRole('link', { name: 'Open Subject 11' })).toBeFocused();

  await page.setViewportSize({ width: 390, height: 400 });
  await page.reload();
  const next = stack.getByRole('button', { name: 'Next subject: Subject 01' });
  await next.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await next.click();
  await expect(stack.getByRole('link', { name: 'Open Subject 01' })).toBeVisible();
});

for (const layout of ['grid', 'stack'] as const) {
  test(`the topic ${layout} fetches more near the end and searches the whole subject`, async ({ page }) => {
    const biology = { ...historySet, subject: 'Biology', title: 'Cell Biology' };
    const anatomy = { ...natureSet, subject: 'Biology', title: 'Human Anatomy' };
    const firstPage = [
      biology,
      ...Array.from({ length: 15 }, (_, index) => ({
        ...biology,
        title: `Practice topic ${index + 1}`,
        setKey: `practice-topic-${index + 1}`,
      })),
    ];
    await page.setViewportSize(layout === 'grid' ? { width: 1280, height: 800 } : { width: 390, height: 844 });
    await page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: { signedIn: true } }));
    await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'catalog_learner' } }));
    await page.route('**/api/v1/decks', (route) => route.fulfill({ json: { items: [] } }));
    await page.route('**/api/v1/me/saved-sets?*', (route) =>
      route.fulfill({
        json: {
          items: [{ ...biology, id: '7', reviewsPaused: false }],
          nextCursor: null,
          counts: { active: 1, paused: 0 },
        },
      }),
    );
    let keyReads = 0;
    await page.route('**/api/v1/me/saved-sets/keys', (route) => {
      keyReads++;
      return route.fulfill({ json: [biology.setKey] });
    });
    await mockReviewers(page, [...firstPage, anatomy]);
    const reads: { after: string | null; search: string | null }[] = [];
    let failSecondPage!: () => void;
    const pending = new Promise<void>((resolve) => {
      failSecondPage = resolve;
    });
    let nextPageReads = 0;
    await page.route('**/api/v1/public-sets?published=true*', async (route) => {
      const params = new URL(route.request().url()).searchParams;
      expect(params.get('subject')).toBe('Biology');
      const after = params.get('after');
      const search = params.get('q');
      reads.push({ after, search });
      if (search === 'Anatomy') {
        await route.fulfill({ json: [anatomy] });
      } else if (!after) {
        await route.fulfill({ json: firstPage, headers: { 'X-Next-Cursor': 'second-page' } });
      } else if (++nextPageReads === 1) {
        await pending;
        await route.fulfill({ status: 500 });
      } else {
        await route.fulfill({ json: [anatomy] });
      }
    });

    try {
      await page.goto('/library?shelf=saved');
      await expect(page.getByRole('link', { name: 'Open Cell Biology' })).toBeVisible();
      await page.getByRole('link', { name: 'Browse' }).click();
      const subject = page.getByRole('link', { name: 'Open Biology' });
      await expect(subject).toHaveAccessibleDescription('17 topics');
      expect(reads).toEqual([]);
      await subject.click();

      const first = page.getByRole('link', { name: 'Open Cell Biology' });
      await expect(first.getByText('Saved', { exact: true })).toBeVisible();
      expect(keyReads).toBe(0);
      const search = page.getByRole('searchbox', { name: 'Search topics' });
      await search.fill('Anatomy');
      const last = page.getByRole('link', { name: 'Open Human Anatomy' });
      await expect(last).toBeVisible();
      expect(reads).toEqual([
        { after: null, search: null },
        { after: null, search: 'Anatomy' },
      ]);
      await search.fill('');
      await expect(first).toBeVisible();

      const nearEnd = page.getByRole('link', { name: 'Open Practice topic 14', exact: true });
      if (layout === 'grid') {
        await nearEnd.scrollIntoViewIfNeeded();
      } else {
        await first.focus();
        for (let index = 1; index <= 14; index++) {
          await page.keyboard.press('ArrowDown');
          await expect(page.getByRole('link', { name: `Open Practice topic ${index}`, exact: true })).toBeFocused();
        }
      }
      await expect.poll(() => nextPageReads).toBe(1);
      await expect(nearEnd).toBeVisible();
      failSecondPage();
      await expect(page.getByRole('alert')).toHaveText('Topics couldn’t load.');
      await expect(nearEnd).toBeVisible();
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      if (layout === 'stack') {
        await nearEnd.focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('link', { name: 'Open Practice topic 15', exact: true })).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(last).toBeFocused();
      }
      await expect(last).toBeVisible();
      expect(nextPageReads).toBe(2);
    } finally {
      failSecondPage();
    }
  });
}

test('desktop Reviewers use Library’s layout switch and preserve the selected view', async ({ page }) => {
  const biology = { ...historySet, title: 'Cell Biology Basics', subject: 'Biology' };
  const computing = { ...natureSet, title: 'Data structures', subject: 'Computing' };
  const algorithms = { ...computing, setKey: 'algorithms', title: 'Algorithms' };
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: { signedIn: true } }));
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'catalog_learner' } }));
  await mockReviewers(page, [biology, computing, algorithms]);
  let keyReads = 0;
  await page.route('**/api/v1/me/saved-sets/keys', (route) => {
    keyReads++;
    return route.fulfill({ json: [algorithms.setKey] });
  });
  await page.goto('/published');

  const grid = page.getByRole('button', { name: 'Grid' });
  const stackMode = page.getByRole('button', { name: 'Stack' });
  const biologyCard = page.getByRole('link', { name: 'Open Biology' });
  const computingCard = page.getByRole('link', { name: 'Open Computing' });
  const stack = page.getByRole('region', { name: 'Subjects' });
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(biologyCard).toHaveAccessibleDescription('1 topic');
  await expect(computingCard).toHaveAccessibleDescription('2 topics');
  expect(keyReads).toBe(0);
  await computingCard.click();
  await expect(page.getByRole('heading', { name: 'Computing', level: 1 })).toBeFocused();
  const topics = page.getByRole('list', { name: 'Topics' });
  const dataStructures = topics.getByRole('link', { name: /Data structures/ });
  const algorithmsLink = topics.getByRole('link', { name: /Algorithms/ });
  await expect(topics).toHaveCSS('display', 'grid');
  await expect(algorithmsLink.getByText('Saved', { exact: true })).toBeVisible();
  await expect(dataStructures.getByText('Saved', { exact: true })).toHaveCount(0);
  expect(keyReads).toBe(1);
  const left = await dataStructures.boundingBox();
  const right = await algorithmsLink.boundingBox();
  expect(left?.y).toBe(right?.y);
  expect(left?.x).toBeLessThan(right?.x ?? 0);

  const topicStack = page.getByRole('region', { name: 'Topics' });
  const nextTopic = topicStack.getByRole('button', { name: 'Next topic: Algorithms' });
  await stackMode.click();
  await expect(page).toHaveURL(/subject=Computing&view=stack$/);
  await expect(topicStack.getByRole('link', { name: 'Open Data structures' })).toBeVisible();
  await grid.click();

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(topics).toBeHidden();
  await expect(nextTopic).toBeVisible();
  await nextTopic.click();
  await expect(
    topicStack.getByRole('link', { name: 'Open Algorithms' }).getByText('Saved', { exact: true }),
  ).toBeVisible();
  await expect(topicStack.getByText(/of 2/)).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('link', { name: 'Reviewers', exact: true }).click();
  await expect(computingCard).toBeFocused();

  await stackMode.click();
  await expect(stackMode).toHaveAttribute('aria-pressed', 'true');
  await expect(stack.getByText('2 topics')).toHaveCount(1);
  await stack.getByRole('link', { name: /^Open / }).click();
  await page.getByRole('link', { name: 'Reviewers', exact: true }).click();
  await expect(stackMode).toHaveAttribute('aria-pressed', 'true');
  await grid.click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(grid).toBeHidden();
  await expect(stack.getByRole('link', { name: /^Open / })).toBeVisible();
});
