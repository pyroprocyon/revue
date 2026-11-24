import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { PublicSet } from '../src/features/catalog/application/publicContent';
import { historySet, natureSet } from '../src/test/fixtures';

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
    if (layout === 'grid') expect(position).toBeGreaterThan(200);
    await topic.click();
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
