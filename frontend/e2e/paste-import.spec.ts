import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, signOut } from './fixtures';

const MIXED_PASTE = `What is an archipelago?
A group of islands.

What is a strait?

Q: What is an isthmus?
A: A narrow strip of land joining two larger land areas.`;

async function signup(page: Page, signupUrl: string) {
  await page.goto(signupUrl);
  const username = `paste_${randomUUID().slice(0, 16)}`;
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('kanjii');
  await page.getByLabel('Confirm password', { exact: true }).fill('kanjii');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  return username;
}

async function createDeckAndOpenPaste(page: Page, title: string) {
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: 'Paste many cards at once' }).click();
  await expect(page.getByRole('heading', { name: 'Paste cards', level: 1 })).toBeVisible();
}

async function previewPaste(page: Page, text: string) {
  await page.getByLabel('Your text').fill(text);
  await page.getByRole('button', { name: /^Preview / }).click();
  await expect(page.getByRole('heading', { name: 'Preview cards', level: 1 })).toBeFocused();
}

async function deckCardCount(page: Page) {
  const { items } = (await (await page.request.get('/api/v1/decks')).json()) as { items: { cardCount: number }[] };
  return items.map((deck) => deck.cardCount);
}

async function hasSidewaysScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('on the smallest phone a learner fixes the incomplete card without retyping, imports and studies it', async ({
    page,
    pilot,
  }, info) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await signup(page, pilot.signupUrl);
    await createDeckAndOpenPaste(page, 'Philippine geography');
    await previewPaste(page, MIXED_PASTE);

    const toFix = page.getByRole('button', { name: /^1\scard to fix$/ });
    const importButton = page.getByRole('button', { name: /^Import 3\scards$/ });
    await expect(toFix).toBeVisible();
    await page.getByRole('button', { name: /^Card 3, What is an isthmus/ }).tap();
    await toFix.tap();
    const answer = page.getByLabel('Answer', { exact: true });
    await expect(answer).toBeFocused();
    await expect(answer).toHaveAttribute('aria-invalid', 'true');
    expect(await hasSidewaysScroll(page)).toBe(false);
    await page.screenshot({ path: info.outputPath('paste-preview-320.png') });

    await page.keyboard.type('A narrow channel of water.');
    await expect(page.getByText('Ready to import', { exact: true })).toBeVisible();
    await importButton.tap();
    await expect(page.getByText(/^3\scards imported\.$/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Philippine geography', level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-card-row]')).toHaveText([
      /What is an archipelago\?/,
      /What is a strait\?/,
      /What is an isthmus\?/,
    ]);
    await expect(page.getByText(/^3\scards imported\.$/)).toHaveCount(0);
    expect(await deckCardCount(page)).toEqual([3]);

    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('link', { name: /Open Philippine geography/ })).toContainText(/3\scards/);
    await page.getByRole('link', { name: /Open Philippine geography/ }).click();
    await page.getByRole('link', { name: 'Start review', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'What is an archipelago?', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: /^Good:/ }).click();
    await expect(page.getByRole('heading', { name: 'What is a strait?', exact: true })).toBeFocused();
  });
});

test('the preview fits 320 pixels at 200% text and keeps every action reachable', async ({ page, pilot }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signup(page, pilot.signupUrl);
  await createDeckAndOpenPaste(page, 'Enlarged text');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(await hasSidewaysScroll(page)).toBe(false);
  await previewPaste(page, MIXED_PASTE);
  expect(await hasSidewaysScroll(page)).toBe(false);
  for (const name of [/^Import 3\scards$/, /^1\scard to fix$/, /^Remove card$/, /^Done$/]) {
    const control = page.getByRole('button', { name });
    await control.scrollIntoViewIfNeeded();
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: info.outputPath('paste-preview-320-200.png'), fullPage: true });
});

test('on a tablet the preview shows the chosen card beside the list and keeps Import in reach', async ({
  page,
  pilot,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await signup(page, pilot.signupUrl);
  await createDeckAndOpenPaste(page, 'Tablet preview');
  await previewPaste(page, MIXED_PASTE);

  const selectedCard = page.getByRole('region', { name: 'Selected card' });
  await expect(selectedCard.getByRole('heading', { name: 'Card 2 of 3' })).toBeVisible();
  await page.getByRole('button', { name: /^Card 3, What is an isthmus/ }).click();
  await expect(selectedCard.getByRole('heading', { name: 'Card 3 of 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Import 3\scards$/ })).toBeInViewport({ ratio: 1 });
  expect(await hasSidewaysScroll(page)).toBe(false);
});

test('rows from Quizlet, a spreadsheet or an older Anki import one card per row, and only HTML fields read as HTML', async ({
  page,
  pilot,
}) => {
  const imageRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('pasted-image')) imageRequests.push(request.url());
  });
  await signup(page, pilot.signupUrl);
  await createDeckAndOpenPaste(page, 'Quizlet set');
  await previewPaste(
    page,
    [
      'archipelago\tA group of islands',
      'strait\tA narrow channel',
      'that joins two seas',
      'bay\tA wide inlet\tLarger ones are gulfs',
      'compare\tA < B, and C > D',
      'heart\tFour<br>chambers<img src="/pasted-image.png">',
    ].join('\n'),
  );
  await expect(page.getByText('Ready to import', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Card 5, heart Four chambers Had an image$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Import 5\scards$/ }).click();
  await expect(page.getByText(/^5\scards imported\.$/)).toBeVisible();
  expect(imageRequests).toEqual([]);

  const deckId = new URL(page.url()).pathname.split('/').at(-1);
  const { items } = (await (await page.request.get(`/api/v1/decks/${deckId}/cards`)).json()) as {
    items: { question: string; answer: string; explanation: string | null }[];
  };
  expect(items.map(({ question, answer, explanation }) => ({ question, answer, explanation }))).toEqual([
    { question: 'archipelago', answer: 'A group of islands', explanation: null },
    { question: 'strait', answer: 'A narrow channel\nthat joins two seas', explanation: null },
    { question: 'bay', answer: 'A wide inlet', explanation: 'Larger ones are gulfs' },
    { question: 'compare', answer: 'A < B, and C > D', explanation: null },
    { question: 'heart', answer: 'Four\nchambers', explanation: null },
  ]);
});

test('a lost response and an overlapping confirmation of the same import save each card once', async ({
  page,
  pilot,
}) => {
  await signup(page, pilot.signupUrl);
  await createDeckAndOpenPaste(page, 'Retries');
  await previewPaste(page, 'One?\n1\n\nTwo?\n2');
  await page.route(
    '**/api/v1/decks/*/import',
    async (route) => {
      const request = route.request();
      const headers = Object.fromEntries(
        Object.entries(await request.allHeaders()).filter(([name]) => !['cookie', 'content-length'].includes(name)),
      );
      const [committed, overlapping] = await Promise.all([
        route.fetch(),
        page.request.post(request.url(), { headers, data: request.postData() ?? '' }),
      ]);
      expect(committed.status()).toBe(201);
      expect(overlapping.status()).toBe(201);
      await route.abort('failed');
    },
    { times: 1 },
  );

  const importButton = page.getByRole('button', { name: /^Import 2\scards$/ });
  await importButton.click();
  await expect(page.getByRole('alert')).toContainText('Trying again won’t add the cards twice.');
  await importButton.click();
  await expect(page.getByText(/^2\scards imported\.$/)).toBeVisible();
  expect(await deckCardCount(page)).toEqual([2]);
});

test('an import problem shows beside the Import button after scrolling to the end of a long preview', async ({
  page,
  pilot,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page, pilot.signupUrl);
  await createDeckAndOpenPaste(page, 'Long preview');
  await previewPaste(page, Array.from({ length: 40 }, (_, index) => `Question ${index + 1}?\nAnswer`).join('\n\n'));
  await page.route('**/api/v1/decks/*/import', (route) => route.abort('failed'), { times: 1 });

  await page.getByRole('button', { name: /^Card 40, Question 40\?/ }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /^Import 40\scards$/ }).click();
  await expect(page.getByRole('alert')).toContainText('We couldn’t confirm the import.');
  await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
});

async function fieldClearsDock(page: Page, label: string) {
  return page.evaluate((text) => {
    const fieldLabel = [...document.querySelectorAll('label')].find((item) => item.textContent === text);
    const field = fieldLabel?.control;
    const dock = document.querySelector('.paste-dock');
    if (!fieldLabel || !field || !dock) return false;
    const visibleBottom = Math.min(dock.getBoundingClientRect().top, window.innerHeight);
    return fieldLabel.getBoundingClientRect().top >= 0 && field.getBoundingClientRect().bottom <= visibleBottom;
  }, label);
}

test('the card to fix and its label stay clear of the dock beside an import problem, also with the keyboard open', async ({
  page,
  pilot,
}) => {
  await signup(page, pilot.signupUrl);
  await createDeckAndOpenPaste(page, 'Keyboard open');
  await previewPaste(page, Array.from({ length: 30 }, (_, index) => `Question ${index + 1}?\nAnswer`).join('\n\n'));
  await page.route('**/api/v1/decks/*/import', (route) =>
    route.fulfill({ status: 409, json: { reason: 'CARD_LIMIT', availableCards: 10 } }),
  );
  await page.getByRole('button', { name: /^Import 30\scards$/ }).click();
  await expect(page.getByRole('alert')).toContainText('room for 10 more cards');
  await page.getByRole('button', { name: /^Card 25, Question 25\?/ }).click();
  await page.getByRole('textbox', { name: 'Answer' }).fill('');
  await page.getByRole('button', { name: 'Done' }).click();

  for (const [width, height, textSize] of [
    [375, 667, '100%'],
    [375, 360, '100%'],
    [320, 300, '200%'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
      window.scrollTo(0, 0);
    }, textSize);
    await page.getByRole('button', { name: /^1\scard to fix$/ }).click();
    await expect(page.getByRole('textbox', { name: 'Answer' })).toBeFocused();
    expect(await fieldClearsDock(page, 'Answer')).toBe(true);
  }
});

test('a sign-in in another tab hides the preview from the new learner at once and saves nothing', async ({
  page,
  context,
  pilot,
}) => {
  const first = await signup(page, pilot.signupUrl);
  await createDeckAndOpenPaste(page, 'First learner’s deck');
  await previewPaste(page, 'Private question?\nPrivate answer');

  const other = await context.newPage();
  await other.goto('/account');
  await signOut(other);
  await expect(other).toHaveURL(/\/sign-in$/);
  await signup(other, pilot.signupUrl);

  await expect(page.getByText(/Private question/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Import 1\scard$/ })).toHaveCount(0);
  expect(await deckCardCount(other)).toEqual([]);

  await other.goto('/account');
  await signOut(other);
  await other.getByLabel('Username', { exact: true }).fill(first);
  await other.getByLabel('Password', { exact: true }).fill('kanjii');
  await other.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(other).toHaveURL(/\/today$/);
  expect(await deckCardCount(other)).toEqual([0]);
  await other.close();
});
