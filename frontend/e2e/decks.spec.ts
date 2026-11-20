import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function signup(page: Page, signupUrl: string) {
  await page.goto(signupUrl);
  const username = `deck_${randomUUID().slice(0, 16)}`;
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('kanjii');
  await page.getByLabel('Confirm password', { exact: true }).fill('kanjii');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  return username;
}

async function addCard(page: Page, question: string, answer: string) {
  await page.getByLabel('Question', { exact: true }).fill(question);
  await page.getByLabel('Answer', { exact: true }).fill(answer);
  await page.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('');
}

async function editCard(page: Page, question: string) {
  await page
    .locator('[data-card-row]')
    .filter({ has: page.getByText(question, { exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Edit card', exact: true }).click();
}

async function rateShownCard(page: Page, answer: string) {
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('heading', { name: answer, exact: true })).toBeFocused();
  await expect(page.getByText('Personal card', { exact: true })).toBeVisible();
  await expect(page.getByText(/Published by/)).toHaveCount(0);
  await page.getByRole('button', { name: /^Good:/ }).click();
}

test('a refreshed search preserves a draft after another tab changes the matching card', async ({
  page,
  pilot,
}, info) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Draft protection');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await addCard(page, 'What is osmosis?', 'Water crossing a membrane');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const deckUrl = page.url();
  await page.goto(`${deckUrl}?q=osmosis`);
  await editCard(page, 'What is osmosis?');
  const answer = page.getByLabel('Answer', { exact: true });
  await answer.fill('Keep my unsaved correction');

  const otherTab = await page.context().newPage();
  try {
    await otherTab.goto(deckUrl);
    await editCard(otherTab, 'What is osmosis?');
    await otherTab.getByLabel('Question', { exact: true }).fill('A different question');
    await otherTab.getByRole('button', { name: 'Save card', exact: true }).click();
    await expect(otherTab.getByRole('dialog').getByText('Card saved.', { exact: true })).toBeVisible();

    const refreshed = page.waitForResponse((response) => response.url().endsWith('/cards?q=osmosis'));
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    expect((await (await refreshed).json()).items).toEqual([]);
    await expect(answer).toHaveValue('Keep my unsaved correction');
    await expect(page.getByText('No cards match your search.')).toHaveCount(0);

    for (const viewport of [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(answer).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: info.outputPath(`retained-draft-${viewport.width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(answer).toHaveValue('Keep my unsaved correction');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(answer).toHaveCount(0);
    await expect(page.getByText('No cards match your search.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Cards', exact: true })).toBeFocused();

    await otherTab.reload();
    await expect(otherTab.getByText('A different question', { exact: true })).toBeVisible();
    await otherTab.getByRole('button', { name: 'A different question' }).click();
    await expect(otherTab.getByRole('dialog').getByText('Water crossing a membrane', { exact: true })).toBeVisible();
  } finally {
    await otherTab.close();
  }
});

test('a learner creates a private deck, starts its first review from the deck and keeps the progress', async ({
  page,
  pilot,
  browser,
}, info) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await signup(page, pilot.signupUrl);
  await page.getByRole('link', { name: 'Create a deck', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Biology quiz');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Biology quiz', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New card', exact: true })).toBeFocused();
  const save = page.getByRole('button', { name: 'Save card', exact: true });
  const tabs = page.getByRole('navigation', { name: 'Your workspace' });
  const saveBox = (await save.boundingBox())!;
  expect(saveBox.y + saveBox.height).toBeLessThanOrEqual((await tabs.boundingBox())!.y);
  await expect(page.getByLabel('Tip to remember', { exact: true })).toBeHidden();
  await page.getByText('Optional details', { exact: true }).click();
  await page.getByLabel('Tip to remember', { exact: true }).fill('Think of water crossing a membrane.');
  await page.getByText('Optional details', { exact: true }).click();
  await expect(page.getByLabel('Tip to remember', { exact: true })).toBeHidden();
  await page.setViewportSize({ width: 375, height: 360 });
  await expect(tabs).toHaveCSS('position', 'static');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({ path: info.outputPath('deck-new-card-phone.png'), fullPage: true });

  await addCard(page, 'What is osmosis?', 'Water crossing a membrane');
  await expect(page.getByRole('status').filter({ hasText: 'Card added.' })).toBeInViewport();
  expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual(
    (await tabs.boundingBox())!.y,
  );
  await addCard(page, 'What is diffusion?', 'Particles spreading out');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add card', exact: true })).toBeFocused();
  await page.locator('[data-card-row]').filter({ hasText: 'What is osmosis?' }).click();
  const sheet = page.getByRole('dialog', { name: 'What is osmosis?' });
  await expect(sheet.getByText('Think of water crossing a membrane.', { exact: true })).toBeVisible();
  const sheetEdit = (await sheet.getByRole('button', { name: 'Edit card', exact: true }).boundingBox())!;
  expect(sheetEdit.y + sheetEdit.height).toBeLessThanOrEqual(667);
  await sheet.getByRole('button', { name: 'Edit card', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByLabel('Tip to remember', { exact: true })).toBeHidden();
  const editSave = (await save.boundingBox())!;
  expect(editSave.y + editSave.height).toBeLessThanOrEqual((await tabs.boundingBox())!.y);
  await page.getByText('Optional details', { exact: true }).click();
  await expect(page.getByLabel('Tip to remember', { exact: true })).toHaveValue('Think of water crossing a membrane.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Back to cards', exact: true }).click();
  const deckUrl = page.url();

  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No cards due today', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Up next' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Open Library', exact: true }).click();
  await page.getByRole('link', { name: 'Open Biology quiz', exact: true }).click();
  await page.getByRole('link', { name: 'Start review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What is osmosis?', exact: true })).toBeFocused();
  await rateShownCard(page, 'Water crossing a membrane');
  await expect(page.getByRole('heading', { name: 'What is diffusion?', exact: true })).toBeFocused();
  await rateShownCard(page, 'Particles spreading out');
  await expect(page.getByRole('heading', { name: '2 cards reviewed', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Back to Today', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'All caught up', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1 day studied', exact: true })).toBeVisible();
  await expect(page.getByText(/^Next review: /)).toBeVisible();

  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('heading', { name: 'Biology quiz', exact: true }).click();
  await expect(page).toHaveURL(deckUrl);

  const otherLearner = await browser.newContext();
  const otherPage = await otherLearner.newPage();
  await signup(otherPage, pilot.signupUrl);
  await expect(otherPage.getByRole('heading', { name: 'No cards to review yet' })).toBeVisible();
  await otherPage.goto(deckUrl);
  await expect(otherPage.getByRole('alert')).toHaveText('This deck isn’t in your Library.');
  await expect(otherPage.getByText('What is osmosis?')).toHaveCount(0);
  await otherPage.getByRole('link', { name: 'Back to Library', exact: true }).click();
  await expect(otherPage.getByRole('link', { name: 'Open Biology quiz', exact: true })).toHaveCount(0);
  await otherLearner.close();
});

test('cards can be corrected and deleted by keyboard, and deleting a deck empties Today', async ({ page, pilot }) => {
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Wrong handout');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'New card', exact: true })).toBeFocused();
  await addCard(page, 'First question', 'First answer');
  await addCard(page, 'Second question', 'Second answer');
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await editCard(page, 'First question');
  await page.getByLabel('Answer', { exact: true }).fill('A corrected answer');
  await page.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Card saved.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'First question' }).click();
  await expect(page.getByRole('dialog').getByText('A corrected answer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to cards' }).click();

  const secondRow = page.locator('[data-card-row]').filter({ hasText: 'Second question' });
  await secondRow.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Second question' });
  await expect(sheet.getByRole('heading', { name: 'Second question' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(secondRow).toBeFocused();
  await page.keyboard.press('Enter');
  await sheet.getByRole('button', { name: 'Back to cards', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(secondRow).toBeFocused();
  await page.keyboard.press('Enter');
  const remove = sheet.getByRole('button', { name: 'Delete', exact: true });
  await remove.focus();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('dialog', { name: 'Delete card?' });
  await expect(confirm.getByText('Second question', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Keep card', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Delete card', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Card deleted.', { exact: true })).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page.locator('[data-card-row]').filter({ hasText: 'First question' })).toBeFocused();
  await expect(page.getByText('Second question')).toHaveCount(0);

  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  const otherDeck = await page.request.post('/api/v1/decks', {
    data: { title: 'Another deck' },
    headers: { [csrf.headerName]: csrf.token },
  });
  expect(otherDeck.status()).toBe(201);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search decks' });
  await search.fill('Wrong handout');
  await page.getByRole('link', { name: 'Open Wrong handout', exact: true }).click();
  await page.getByRole('button', { name: 'Deck settings', exact: true }).click();
  await page.getByRole('button', { name: 'Delete deck', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete deck?' })
    .getByRole('button', { name: 'Delete deck', exact: true })
    .click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText('Deleted “Wrong handout” and its cards.', { exact: true })).toBeFocused();
  await expect(search).toHaveValue('Wrong handout');
  await expect(page.getByText('No decks match your search.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create a deck', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear deck search' }).click();
  const remainingDeck = page.getByRole('link', { name: 'Open Another deck', exact: true });
  await remainingDeck.click();
  await expect(page.getByRole('heading', { name: 'Another deck', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(remainingDeck).toBeFocused();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No cards to review yet' })).toBeVisible();
});

test('a failed card deletion keeps its confirmation, and Escape returns focus', async ({ page, pilot }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Delete checks');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await addCard(page, 'Why does a plant bend toward a window?', 'It grows toward the light.');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.locator('[data-card-row]').filter({ hasText: 'Why does a plant bend' }).click();
  const remove = page
    .getByRole('dialog', { name: 'Why does a plant bend toward a window?' })
    .getByRole('button', { name: 'Delete', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Delete card?' });
  let rejectDelete = () => {};
  const allowReply = new Promise<void>((resolve) => {
    rejectDelete = resolve;
  });
  let deleteRequests = 0;
  await page.route('**/api/v1/cards/*', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }
    deleteRequests += 1;
    await allowReply;
    await route.fulfill({ status: 503, json: {} });
  });

  try {
    await remove.click();
    await expect(dialog.getByRole('button', { name: 'Keep card' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Delete card', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    rejectDelete();
    await expect(dialog.getByRole('alert')).toContainText('We couldn’t confirm the change.');
    await expect(dialog.getByRole('button', { name: 'Keep card' })).toBeEnabled();
    expect(await dialog.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
      await dialog.evaluate((element) => element.clientWidth),
    );
    expect(deleteRequests).toBe(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(remove).toBeFocused();
    await expect(
      page
        .getByRole('dialog', { name: 'Why does a plant bend toward a window?' })
        .getByText('It grows toward the light.'),
    ).toBeVisible();
  } finally {
    rejectDelete();
  }
});

async function holdSessionChecks(page: Page) {
  let held: Promise<void> | null = null;
  let release = () => {};
  await page.route('**/api/v1/me', async (route) => {
    if (held) await held;
    await route.continue();
  });
  return {
    async start() {
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.clock.setFixedTime(new Date((await page.evaluate(() => Date.now())) + 30_000));
      const check = page.waitForRequest('**/api/v1/me');
      await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      });
      await check;
    },
    finish() {
      held = null;
      release();
    },
  };
}

async function createDeckWithCard(page: Page, title: string, question: string, answer: string) {
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await addCard(page, question, answer);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}

test('a session check on a phone hides the delete confirmation, then brings back the card and the choice', async ({
  page,
  pilot,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await signup(page, pilot.signupUrl);
  await createDeckWithCard(page, 'Session checks', 'What does a leaf turn toward?', 'The light');
  const sessionChecks = await holdSessionChecks(page);
  const cardScreen = page.getByRole('dialog', { name: 'What does a leaf turn toward?' });
  const confirmation = page.getByRole('dialog', { name: 'Delete card?' });
  try {
    await page.locator('[data-card-row]').filter({ hasText: 'What does a leaf' }).click();
    await cardScreen.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(confirmation.getByRole('button', { name: 'Keep card' })).toBeFocused();
    await sessionChecks.start();
    await expect(confirmation).toBeHidden();
    await expect(cardScreen).toBeHidden();
    sessionChecks.finish();
    await expect(confirmation.getByRole('button', { name: 'Keep card' })).toBeFocused();
    await confirmation.getByRole('button', { name: 'Keep card' }).click();
    await expect(cardScreen.getByText('The light', { exact: true })).toBeVisible();
    await cardScreen.getByRole('button', { name: 'Back to cards' }).click();
    await expect(page.locator('[data-card-row]').filter({ hasText: 'What does a leaf' })).toBeVisible();
  } finally {
    sessionChecks.finish();
  }
});

test('a session check beside the side pane hides the delete confirmation and the discard prompt until it ends', async ({
  page,
  pilot,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signup(page, pilot.signupUrl);
  await createDeckWithCard(page, 'Session checks', 'What does a root grow toward?', 'Water');
  const sessionChecks = await holdSessionChecks(page);
  const pane = page.getByRole('region', { name: 'Selected card' });
  const confirmation = page.getByRole('dialog', { name: 'Delete card?' });
  const prompt = page.getByRole('dialog', { name: 'Discard your changes?' });
  try {
    await page.locator('[data-card-row]').filter({ hasText: 'What does a root' }).click();
    const remove = pane.getByRole('button', { name: 'Delete', exact: true });
    await remove.click();
    await expect(confirmation.getByRole('button', { name: 'Keep card' })).toBeFocused();
    await sessionChecks.start();
    await expect(confirmation).toBeHidden();
    sessionChecks.finish();
    await expect(confirmation.getByRole('button', { name: 'Keep card' })).toBeFocused();
    await confirmation.getByRole('button', { name: 'Keep card' }).click();
    await expect(remove).toBeFocused();

    await pane.getByRole('button', { name: 'Edit card', exact: true }).click();
    await page.getByLabel('Answer', { exact: true }).fill('Moist soil');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(prompt.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await sessionChecks.start();
    await expect(prompt).toBeHidden();
    sessionChecks.finish();
    await expect(prompt.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await prompt.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('Moist soil');
  } finally {
    sessionChecks.finish();
  }
});

test('deck screens fit phone, tablet and desktop widths and enlarged text', async ({ page, pilot }, info) => {
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Araling Panlipunan: Kasaysayan ng Pilipinas');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await addCard(
    page,
    'Ipaliwanag kung bakit mahalaga ang Kongreso ng Malolos sa kasaysayan ng Pilipinas at kung ano ang nagawa nito.',
    'Binuo nito ang unang konstitusyon ng republika.\nItinatag nito ang Unang Republika ng Pilipinas noong 1899.',
  );
  const deckUrl = page.url();
  for (const [label, width, height, scale] of [
    ['phone', 360, 800, 100],
    ['tablet', 768, 1024, 100],
    ['desktop', 1440, 900, 100],
    ['enlarged', 320, 568, 200],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: scale === 200 ? 'reduce' : 'no-preference' });
    for (const [screen, url] of [
      ['deck', deckUrl],
      ['library', '/library'],
      ['new-deck', '/library/decks/new'],
    ] as const) {
      await page.goto(url);
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}%`;
      }, scale);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (screen === 'deck') {
        await page.getByRole('button', { name: 'Add card', exact: true }).click();
        for (const name of ['Save card', 'Done']) {
          const box = await page.getByRole('button', { name, exact: true }).boundingBox();
          expect(box!.height, `${name} height at ${label}`).toBeGreaterThanOrEqual(48);
        }
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        const row = page.locator('[data-card-row]').first();
        await row.click();
        for (const name of ['Edit card', 'Delete']) {
          const box = await page.getByRole('button', { name, exact: true }).boundingBox();
          expect(box!.height, `${name} height at ${label}`).toBeGreaterThanOrEqual(48);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await page.screenshot({ path: info.outputPath(`card-${label}.png`) });
        if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Deck settings', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Deck settings' })).toBeFocused();
        await expect(page.getByRole('button', { name: 'Save name', exact: true })).toHaveCount(0);
        for (const name of ['Delete deck']) {
          const box = await page.getByRole('button', { name, exact: true }).boundingBox();
          expect(box!.height, `${name} height at ${label}`).toBeGreaterThanOrEqual(48);
        }
      }
      if (screen === 'library' && width < 1024) {
        const title = page.locator('[data-slot="front"] h3');
        await expect(title).toBeVisible();
        expect(await title.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: info.outputPath(`${screen}-${label}.png`), fullPage: true });
    }
  }
});

test('phone card fields fit the draft while writing and when reopening a card', async ({ page, pilot }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Java memory');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const question = 'Why does a generational collector collect young objects more often?';
  const answer = page.getByRole('textbox', { name: 'Answer', exact: true });
  const explanation = page.getByRole('textbox', { name: 'Explanation', exact: true });
  const longAnswer = 'Most allocations become unreachable quickly. '.repeat(8).trim();
  await page.getByLabel('Question', { exact: true }).fill(question);
  const emptyHeight = await answer.evaluate((field) => field.clientHeight);
  await answer.fill(longAnswer);
  expect(await answer.evaluate((field) => field.clientHeight)).toBeGreaterThan(emptyHeight);
  await page.getByText('Optional details', { exact: true }).click();
  await explanation.fill('One collection cycle.\n'.repeat(12));
  for (const field of [answer, explanation]) {
    expect(await field.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  }
  await page.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(answer).toHaveValue('');
  expect(await answer.evaluate((field) => field.clientHeight)).toBe(emptyHeight);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await editCard(page, question);
  await expect(answer).toHaveValue(longAnswer);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await answer.evaluate((field) => field.scrollHeight - field.clientHeight)).toBeLessThanOrEqual(1);
});

test('a failed phone save shows the error below Save and preserves the long draft for retry', async ({
  page,
  pilot,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Save recovery');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await addCard(page, 'What is a heap?', 'Memory for allocated objects.');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  const question = page.getByLabel('Question', { exact: true });
  const answer = page.getByLabel('Answer', { exact: true });
  const save = page.getByRole('button', { name: 'Save card', exact: true });
  const alert = page.getByRole('alert').filter({ hasText: 'confirm the change' });
  const longAnswer = 'Young objects become unreachable before the next collection.\n\n'.repeat(8);
  await answer.fill(longAnswer);
  await save.click();
  await expect(question).toBeFocused();
  const questionLabel = page.locator('label').filter({ hasText: /^Question$/ });
  await expect(questionLabel).toBeInViewport({ ratio: 1 });
  await question.fill('Why collect young objects?');
  await page.route('**/api/v1/decks/*/cards', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 503, json: {} }) : route.continue(),
  );
  await save.click();
  await expect(alert).toBeInViewport({ ratio: 1 });
  await expect(alert).toBeFocused();
  await expect(answer).toHaveValue(longAnswer);
  await page.unroute('**/api/v1/decks/*/cards');
  await save.click();
  await expect(answer).toHaveValue('');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await editCard(page, 'Why collect young objects?');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await question.fill('Why collect young objects more often?');
  await page.route('**/api/v1/cards/*', (route) => route.fulfill({ status: 503, json: {} }));
  await save.click();
  await expect(alert).toBeInViewport({ ratio: 1 });
  await expect(alert).toBeFocused();
  await expect(question).toHaveValue('Why collect young objects more often?');
  await expect(answer).toHaveValue(longAnswer.trim());
});

test('unsaved card text survives cancelled navigation, Back, reload and closing the form', async ({
  page,
  pilot,
}, info) => {
  await signup(page, pilot.signupUrl);
  await page.goto('/library');
  await page.getByRole('link', { name: 'Create a deck', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Draft checks');
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.click();
  const dialog = page.getByRole('dialog', { name: 'Discard your changes?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(cancel).toBeFocused();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Draft checks');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New card', exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const deckUrl = page.url();
  await page.getByLabel('Question', { exact: true }).fill('Keep this draft');
  await page.getByLabel('Answer', { exact: true }).fill('Until I save it');
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath('unsaved-phone.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByRole('link', { name: 'Today', exact: true })).toBeFocused();
  await expect(page).toHaveURL(deckUrl);
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('Keep this draft');
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(deckUrl);
  const unload = page.waitForEvent('dialog');
  const reload = page.reload({ timeout: 1500 }).catch(() => undefined);
  const warning = await unload;
  expect(warning.type()).toBe('beforeunload');
  await warning.dismiss();
  await reload;
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('Keep this draft');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('');
  await addCard(page, 'Saved question', 'Saved answer');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(dialog).toHaveCount(0);
});

test('unsaved edits remain protected after a failed save and before Deck settings replaces them', async ({
  page,
  pilot,
}, info) => {
  // The side pane keeps the card form and the Deck settings button on screen together.
  await page.setViewportSize({ width: 1280, height: 800 });
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Edit checks');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await addCard(page, 'Saved question', 'Saved answer');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await editCard(page, 'Saved question');
  await page.getByLabel('Answer', { exact: true }).fill('Corrected answer');
  await page.route('**/api/v1/cards/*', (route) => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/v1/decks/*/cards', (route) => route.fulfill({ status: 503, json: {} }));
  await page.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'confirm the change' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard your changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('Corrected answer');
  await page.getByRole('button', { name: 'Deck settings', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('Corrected answer');
  await expect(page.getByRole('region', { name: 'Deck settings' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(dialog).toHaveCount(1);
  for (const [width, height, scale] of [
    [375, 667, 100],
    [768, 1024, 100],
    [1440, 900, 100],
    [320, 568, 200],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}%`;
    }, scale);
    for (const name of ['Keep editing', 'Discard changes']) {
      const action = dialog.getByRole('button', { name });
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport({ ratio: 0.99 });
    }
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`unsaved-${width}-${scale}.png`) });
  }
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('an unsaved deck name stays when Deck settings moves from the side pane to a phone screen', async ({
  page,
  pilot,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signup(page, pilot.signupUrl);
  await createDeckWithCard(page, 'Exam prep', 'First question', 'Answer');
  await page.getByRole('button', { name: 'Deck settings', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Biology finals');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Biology finals');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Biology finals', level: 1 })).toBeVisible();
});

test('sign-in returns to the requested private deck or new-deck form', async ({ page, pilot }) => {
  const username = await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Return to my deck');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New card', exact: true })).toBeVisible();
  const deckPath = new URL(page.url()).pathname;
  for (const path of [deckPath, '/library/decks/new']) {
    await page.getByRole('link', { name: 'Account', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?returnTo=${encodeURIComponent(path)}$`));
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill('kanjii');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(
      page.getByRole('heading', { name: path === deckPath ? 'Return to my deck' : 'Create a deck', exact: true }),
    ).toBeVisible();
  }
});

test('Library decks follow the finger on phones and tablets and filter the same collection at any width', async ({
  page,
  pilot,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signup(page, pilot.signupUrl);
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  for (const title of ['Biology quiz', 'History review', 'Biology final']) {
    const response = await page.request.post('/api/v1/decks', {
      data: { title },
      headers: { [csrf.headerName]: csrf.token },
    });
    expect(response.status()).toBe(201);
  }
  const reads: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/v1/decks') || pathname === '/api/v1/me/saved-sets') reads.push(pathname);
  });
  const savedSets = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/me/saved-sets');
  await page.goto('/library');
  expect((await savedSets).ok()).toBe(true);
  const decks = page.getByRole('region', { name: 'My decks' });
  const search = decks.getByRole('searchbox', { name: 'Search decks' });
  const carousel = decks.getByRole('region', { name: 'Decks', exact: true });
  const scroller = carousel.locator('.deck-carousel-scroller');
  const activeDeck = carousel.getByRole('link');
  const next = carousel.getByRole('button', { name: /^Next deck:/ });
  const previous = carousel.getByRole('button', { name: /^Previous deck:/ });
  const desktopTiles = decks.locator('ul > li');
  await expect(desktopTiles).toHaveCount(0);
  await expect(activeDeck).toHaveAccessibleName('Open Biology quiz');
  await expect(page.getByRole('link', { name: 'Create a deck', exact: true })).toHaveCount(1);
  const nav = (await page.getByRole('navigation', { name: 'Your workspace' }).boundingBox())!;
  const nextBox = (await next.boundingBox())!;
  const card = (await activeDeck.boundingBox())!;
  const searchBox = (await search.boundingBox())!;
  expect(card.y - (searchBox.y + searchBox.height)).toBeLessThanOrEqual(40);
  expect(nextBox.y + nextBox.height).toBeLessThanOrEqual(nav.y);
  expect(nextBox.y + nextBox.height - (card.y + card.height)).toBeGreaterThanOrEqual(48);
  await expect(previous).toHaveCount(0);

  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = Math.round(card.x + card.width / 2);
  const y = Math.round(card.y + card.height - 14);
  const scrollBefore = await page.evaluate(() => scrollY);
  const thirdDeckStrip = carousel.locator('button[aria-label$=": Biology final"]');
  await expect(thirdDeckStrip).toBeDisabled();
  const stripBottom = async () => {
    const box = (await thirdDeckStrip.boundingBox())!;
    return box.y + box.height;
  };
  const immediateMovement = await thirdDeckStrip.evaluate((strip) => {
    const stack = strip.closest<HTMLElement>('.deck-carousel-scroller')!;
    const initialBottom = strip.getBoundingClientRect().bottom;
    stack.scrollTo({ top: 56, behavior: 'instant' });
    const distance = initialBottom - strip.getBoundingClientRect().bottom;
    stack.scrollTo({ top: 0, behavior: 'instant' });
    return distance;
  });
  expect(immediateMovement).toBeCloseTo(56, 0);
  const stripBottomAtRest = await stripBottom();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 30 }] });
  await expect.poll(stripBottom).toBeLessThan(stripBottomAtRest);
  const stage = scroller.locator('.deck-carousel-stage');
  expect(await stage.evaluate((element) => element.style.getPropertyValue('--deck-progress'))).toBe('');
  const frontCardScaleBetweenSnaps = () =>
    activeDeck.evaluate((link) => new DOMMatrixReadOnly(getComputedStyle(link.closest('article')!).transform).a);
  await expect.poll(frontCardScaleBetweenSnaps).toBeLessThan(1);
  const earlyInDrag = await stripBottom();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 60 }] });
  await expect.poll(async () => earlyInDrag - (await stripBottom())).toBeCloseTo(30, 0);
  await expect(activeDeck).toHaveAccessibleName('Open History review');
  const titleOpacity = await carousel
    .locator('.deck-carousel-summary, .deck-carousel-preview-art')
    .evaluateAll((summaries) => summaries.map((summary) => getComputedStyle(summary).opacity));
  expect(titleOpacity).toEqual(['1', '1', '1']);
  const settled = scroller.evaluate(
    (element) => new Promise<void>((resolve) => element.addEventListener('scrollend', () => resolve(), { once: true })),
  );
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settled;
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await expect.poll(() => scroller.evaluate((element) => Math.abs(element.scrollTop % 56))).toBeLessThan(1);
  await expect(page).toHaveURL(/\/library$/);
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  await activeDeck.hover();
  await page.mouse.wheel(0, 120);
  await expect(activeDeck).toHaveAccessibleName('Open Biology final');
  await expect(next).toHaveCount(0);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const lastCard = (await activeDeck.boundingBox())!;
  const swipeY = Math.round(lastCard.y + lastCard.height - 14);
  const pageOffset = await page.evaluate(() => scrollY);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: swipeY }] });
  for (const distance of [35, 70, 105]) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: swipeY - distance }] });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageOffset);
  await touch.detach();
  await previous.click();
  await expect(activeDeck).toHaveAccessibleName('Open History review');
  await expect(activeDeck).toBeFocused();
  await previous.click();
  await expect(activeDeck).toHaveAccessibleName('Open Biology quiz');
  await expect(previous).toHaveCount(0);
  await expect(activeDeck).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(activeDeck).toHaveAccessibleName('Open History review');
  await expect(activeDeck).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(activeDeck).toHaveAccessibleName('Open Biology quiz');

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
    window.scrollTo(0, 0);
  });
  await expect(search).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await search.fill('  BIOLOGY ');
  await expect(carousel.getByRole('status')).toContainText('1 of 2');
  await expect(activeDeck).toHaveAccessibleName('Open Biology quiz');
  await next.click();
  await expect(activeDeck).toHaveAccessibleName('Open Biology final');
  await search.fill('biology finals');
  await expect(decks.getByText('No decks match your search.')).toBeVisible();
  await decks.getByRole('button', { name: 'Clear deck search' }).click();
  await expect(search).toBeFocused();
  await expect(carousel.getByRole('status')).toContainText('1 of 3');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '100%';
  });
  await expect(carousel).toBeVisible();
  await expect(decks.getByRole('listitem')).toHaveCount(0);
  const tabletCard = (await activeDeck.boundingBox())!;
  const tabletSearch = (await search.boundingBox())!;
  expect(tabletCard.y - (tabletSearch.y + tabletSearch.height)).toBeLessThanOrEqual(48);
  const lastDeckStrip = carousel.getByRole('button', { name: 'Go to deck: Biology final' });
  await expect(lastDeckStrip).toBeVisible();
  const counter = carousel.getByRole('status');
  const counterBefore = (await counter.boundingBox())!;
  expect(counterBefore.y).toBeGreaterThanOrEqual(tabletSearch.y + tabletSearch.height);
  expect(counterBefore.y + counterBefore.height).toBeLessThanOrEqual(tabletCard.y);
  const pageScrollRoom = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(pageScrollRoom).toBe(0);
  await lastDeckStrip.click();
  await expect(activeDeck).toHaveAccessibleName('Open Biology final');
  await expect(activeDeck).toBeFocused();
  await expect(counter).toContainText('3 of 3');
  const counterAfter = (await counter.boundingBox())!;
  expect(counterAfter.y).toBeCloseTo(counterBefore.y, 0);
  expect(counterAfter.x + counterAfter.width).toBeCloseTo(counterBefore.x + counterBefore.width, 0);
  await previous.click();
  await expect(activeDeck).toHaveAccessibleName('Open History review');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(carousel).toBeHidden();
  await expect(decks.getByRole('listitem')).toHaveCount(3);
  await search.fill('biology');
  await expect(decks.getByRole('listitem')).toHaveCount(2);
  expect(reads.sort()).toEqual(['/api/v1/decks', '/api/v1/me/saved-sets']);

  await page.setViewportSize({ width: 375, height: 667 });
  await expect(desktopTiles).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(activeDeck).toHaveAccessibleName('Open Biology quiz');
  await activeDeck.focus();
  await page.keyboard.press('ArrowDown');
  await expect(activeDeck).toHaveAccessibleName('Open Biology final');
  await activeDeck.click();
  await expect(page.getByRole('heading', { name: 'Biology final', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(search).toHaveValue('biology');
  await expect(activeDeck).toHaveAccessibleName('Open Biology final');
  await expect(activeDeck).toBeFocused();
});

test('the phone stack follows replacement decks after reconnecting with the same deck count', async ({
  page,
  pilot,
}) => {
  await signup(page, pilot.signupUrl);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let titles = ['Biology', 'History', 'Physics', 'Math'];
  await page.route('**/api/v1/decks', (route) =>
    route.fulfill({ json: { items: titles.map((title) => ({ id: title, title, cardCount: 1, archived: false })) } }),
  );
  await page.goto('/library');
  const stack = page.getByRole('region', { name: 'Decks', exact: true });
  await expect(stack.getByRole('button', { name: 'Next deck: History' })).toBeVisible();

  titles = ['Biology', 'Chemistry', 'Music', 'Math'];
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await stack.getByRole('button', { name: 'Next deck: Chemistry' }).click();
  await expect(stack.getByRole('link')).toHaveAccessibleName('Open Chemistry');
  await stack.getByRole('button', { name: 'Next deck: Music' }).click();
  await expect(stack.getByRole('status')).toContainText('3 of 4');
  await expect(stack.getByRole('link')).toHaveAccessibleName('Open Music');
});

test('adjacent deck strips remain tappable when the phone text size changes', async ({ page, pilot }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signup(page, pilot.signupUrl);
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  for (const title of ['First deck', 'Middle deck', 'Last deck']) {
    const response = await page.request.post('/api/v1/decks', {
      data: { title },
      headers: { [csrf.headerName]: csrf.token },
    });
    expect(response.status()).toBe(201);
  }
  await page.goto('/library');
  const carousel = page.getByRole('region', { name: 'Decks', exact: true });
  const activeDeck = carousel.getByRole('link');
  const previous = carousel.getByRole('button', { name: /^Previous deck:/ });
  const next = carousel.getByRole('button', { name: /^Next deck:/ });

  for (const size of [80, 90, 105, 115, 120]) {
    await page.evaluate((percent) => {
      document.documentElement.style.fontSize = `${percent}%`;
    }, size);
    await next.click();
    await expect(activeDeck).toHaveAccessibleName('Open Middle deck');
    await expect(previous).toHaveAccessibleName('Previous deck: First deck');
    await expect(next).toHaveAccessibleName('Next deck: Last deck');
    const tappableHeight = await previous.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const x = box.x + box.width / 2;
      let height = 0;
      for (let y = Math.ceil(box.top); y < box.bottom; y += 1) {
        if (button.contains(document.elementFromPoint(x, y))) height += 1;
      }
      return height;
    });
    expect(tappableHeight, `Previous deck at ${size}% text`).toBeGreaterThanOrEqual(48);
    await previous.click();
    await expect(activeDeck).toHaveAccessibleName('Open First deck');
    await expect(activeDeck).toBeFocused();
  }
});

test('deck lists append cards on phones and page by keyboard on wide screens', async ({ page, pilot }) => {
  await signup(page, pilot.signupUrl);
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  const headers = { [csrf.headerName]: csrf.token };
  const created = await page.request.post('/api/v1/decks', { data: { title: 'Pagination checks' }, headers });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  for (let index = 1; index <= 44; index += 1) {
    const card = await page.request.post(`/api/v1/decks/${id}/cards`, {
      data: {
        question:
          index === 2 || index === 42
            ? 'What changes when a question takes several lines in the card list?'
            : `Question ${index}`,
        answer: `Answer ${index}`,
        explanation: index === 3 || index === 42 ? 'An optional detail.' : null,
      },
      headers,
    });
    expect(card.status()).toBe(201);
  }
  await page.goto(`/library/decks/${id}`);
  const cards = page.getByRole('list', { name: 'Cards' });
  const pager = page.getByRole('navigation', { name: 'Deck pages' });
  const previous = pager.getByRole('button', { name: 'Previous', exact: true });
  const next = pager.getByRole('button', { name: 'Next', exact: true });
  const settings = page.getByRole('button', { name: 'Deck settings', exact: true });
  await expect(cards.getByRole('listitem')).toHaveCount(20);
  const more = page.getByRole('button', { name: 'Show more cards' });

  for (const [width, height, scale] of [
    [1440, 900, 100],
    [1024, 768, 100],
    [768, 1024, 100],
    [375, 667, 100],
    [320, 568, 100],
    [320, 568, 200],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}%`;
    }, scale);
    await page.evaluate(() => document.fonts.ready);
    if (width >= 768) {
      await expect(previous).toBeDisabled();
      await expect(more).toHaveCount(0);
      const bar = (await pager.boundingBox())!;
      const list = (await cards.boundingBox())!;
      expect(bar.y + bar.height).toBeLessThan(list.y);
      const settingsBox = (await settings.boundingBox())!;
      expect(Math.abs(bar.y + bar.height / 2 - (settingsBox.y + settingsBox.height / 2))).toBeLessThan(2);
    } else {
      await expect(more).toBeVisible();
      await expect(pager).toHaveCount(0);
      const button = (await more.boundingBox())!;
      const list = (await cards.boundingBox())!;
      expect(button.y).toBeGreaterThanOrEqual(list.y + list.height);
      expect(button.height).toBeGreaterThanOrEqual(48);
      await expect(cards.getByText('Answer 1', { exact: true })).toHaveCount(0);
    }
    const heights = await cards
      .getByRole('button')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    const [short, wrapped, withDetail] = heights;
    expect(short).toBeGreaterThanOrEqual(48);
    expect(wrapped).toBeGreaterThan(short);
    expect(withDetail).toBeGreaterThan(short);
    const detailsRow = cards.getByRole('button', { name: 'Question 3 Explanation' });
    const question = (await detailsRow.getByText('Question 3', { exact: true }).boundingBox())!;
    const icon = (await detailsRow.locator('span[aria-hidden=true] svg').boundingBox())!;
    expect(icon.y - (question.y + question.height)).toBeLessThanOrEqual((8 * scale) / 100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }

  await page.route('**/cards?after=*', (route) => route.fulfill({ status: 503, json: {} }), { times: 1 });
  await more.click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t load more cards');
  await expect(cards.getByRole('listitem')).toHaveCount(20);
  const retry = page.getByRole('button', { name: 'Try again' });
  await retry.focus();
  await retry.press('Enter');
  const row21 = cards.getByRole('button', { name: 'Question 21', exact: true });
  await expect(row21).toBeFocused();
  await expect(cards.getByRole('listitem')).toHaveCount(40);
  await more.scrollIntoViewIfNeeded();
  const lastRow = cards.getByRole('button', { name: 'Question 40', exact: true });
  const before = (await lastRow.boundingBox())!;
  await more.click();
  await expect(cards.getByRole('listitem')).toHaveCount(44);
  expect(Math.abs((await lastRow.boundingBox())!.y - before.y)).toBeLessThan(3);
  await expect(more).toHaveCount(0);
  await row21.click();
  await expect(page.getByRole('dialog').getByText('Answer 21')).toBeVisible();
  await page.getByRole('button', { name: 'Edit card' }).click();
  await page.getByLabel('Question', { exact: true }).fill('Updated question 21');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.getByRole('button', { name: 'Back to cards' }).click();
  await expect(cards.getByRole('button', { name: 'Updated question 21' })).toBeFocused();
  await page.goto(`/library/decks/${id}?q=Answer`);
  await more.click();
  const filtered = cards.getByRole('button', { name: 'Updated question 21' });
  await filtered.click();
  await page.getByRole('button', { name: 'Edit card' }).click();
  await page.getByLabel('Answer', { exact: true }).fill('New explanation');
  await page.getByRole('button', { name: 'Save card' }).click();
  await expect(page.getByText('Card saved. It no longer matches your search.')).toBeVisible();
  await expect(filtered).toHaveCount(0);
  await expect(cards.getByRole('button', { name: 'Question 22' })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/library/decks/${id}`);
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\?after=/);
  await expect(cards.getByRole('listitem')).toHaveCount(20);
  await expect(cards.getByText('Updated question 21', { exact: true })).toBeVisible();
  await expect(next).toBeEnabled();
  await previous.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/library/decks/${id}$`));
  await expect(cards.getByRole('listitem')).toHaveCount(20);
  await expect(cards.getByText('Question 1', { exact: true })).toBeVisible();
});

test('search finds cards beyond the current page and keeps result pages scoped to the term', async ({
  page,
  pilot,
}) => {
  // The side pane keeps the card form and the search field on screen together.
  await page.setViewportSize({ width: 1280, height: 800 });
  await signup(page, pilot.signupUrl);
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  const headers = { [csrf.headerName]: csrf.token };
  const created = await page.request.post('/api/v1/decks', { data: { title: 'Search checks' }, headers });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  for (let index = 1; index <= 24; index += 1) {
    const createdCard = await page.request.post(`/api/v1/decks/${id}/cards`, {
      data: { question: `Question ${index}`, answer: index < 3 ? 'First topic' : `Practice match ${index}` },
      headers,
    });
    expect(createdCard.status()).toBe(201);
  }
  await page.goto(`/library/decks/${id}`);
  const cards = page.getByRole('list', { name: 'Cards' });
  const search = page.getByRole('searchbox', { name: 'Search cards' });
  const addCardButton = page.getByRole('button', { name: 'Add card', exact: true });
  const question24 = cards.getByText('Question 24', { exact: true });
  await expect(cards.getByRole('listitem')).toHaveCount(20);
  await expect(question24).toHaveCount(0);
  await expect(search).toBeVisible();
  await editCard(page, 'Question 1');
  await page.getByLabel('Answer', { exact: true }).fill('Unsaved text');
  await search.fill('  PRACTICE MATCH 24  ');
  await expect(page.getByText('Finish editing to update results.', { exact: true })).toBeVisible();
  const discard = page.getByRole('dialog', { name: 'Discard your changes?' });
  await expect(discard).toBeHidden();
  await search.press('Enter');
  await expect(discard).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('Unsaved text');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(question24).toBeVisible();
  await expect(cards.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByLabel('Answer', { exact: true })).toHaveCount(0);

  await search.fill('Practice match');
  const pager = page.getByRole('navigation', { name: 'Deck pages' });
  await expect(cards.getByRole('listitem')).toHaveCount(20);
  await pager.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(cards.getByRole('listitem')).toHaveCount(2);
  await expect(question24).toBeVisible();
  await pager.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(cards.getByRole('listitem')).toHaveCount(20);
  await expect(search).toHaveValue('Practice match');
  await expect(cards.getByText('Question 1', { exact: true })).toHaveCount(0);

  await search.fill('No such answer');
  await expect(page.getByText('No cards match your search.', { exact: true })).toBeVisible();
  await search.fill('');
  await expect(cards.getByText('Question 1', { exact: true })).toBeVisible();
  await expect(search).toBeVisible();
  await search.fill('Practice match 24');
  await expect(question24).toBeVisible();
  await page.getByRole('button', { name: 'Clear card search', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(addCardButton).toBeVisible();
  await expect(cards.getByText('Question 1', { exact: true })).toBeVisible();
  await expect(cards.getByRole('listitem')).toHaveCount(20);
  expect(new URL(page.url()).search).toBe('');

  await search.fill('First topic');
  await expect(cards.getByRole('listitem')).toHaveCount(2);
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(cards.getByRole('listitem')).toHaveCount(20);
});

test('retrying a confirmed create after losing its response keeps one deck and one card', async ({ page, pilot }) => {
  await signup(page, pilot.signupUrl);
  await page.getByRole('link', { name: 'Create a deck' }).click();
  async function dropResponse(path: string) {
    await page.route(
      path,
      async (route) => {
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        await route.abort('failed');
      },
      { times: 1 },
    );
  }
  await page.getByLabel('Name', { exact: true }).fill('Finals');
  await dropResponse('**/api/v1/decks');
  const create = page.getByRole('button', { name: 'Create', exact: true });
  await create.click();
  await expect(page.getByRole('alert')).toContainText('couldn’t confirm');
  await create.click();
  await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();
  await page.getByLabel('Question', { exact: true }).fill('Which city?');
  await page.getByLabel('Answer', { exact: true }).fill('Manila');
  await dropResponse('**/api/v1/decks/*/cards');
  const save = page.getByRole('button', { name: 'Save card', exact: true });
  await save.click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('couldn’t confirm');
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('Which city?');
  const other = await page.context().newPage();
  await other.goto(page.url());
  await editCard(other, 'Which city?');
  await other.getByLabel('Answer', { exact: true }).fill('Quezon City');
  await other.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(other.getByText('Card saved.', { exact: true }).first()).toBeVisible();
  await other.close();
  await save.click();
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('');
  const { items } = await (await page.request.get('/api/v1/decks')).json();
  expect(items).toHaveLength(1);
  expect(items[0].cardCount).toBe(1);
  const cards = await (await page.request.get('/api/v1/decks/' + items[0].id + '/cards')).json();
  expect(cards.items).toMatchObject([{ answer: 'Quezon City', contentVersion: 2 }]);
});

test('a stale editor keeps the draft and the other tab’s correction survives', async ({ page, pilot, context }) => {
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Geography');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await addCard(page, 'Direction?', 'West');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const other = await context.newPage();
  await other.goto(page.url());
  await editCard(page, 'Direction?');
  await editCard(other, 'Direction?');
  await page.getByLabel('Question', { exact: true }).fill('Compass direction?');
  await other.getByLabel('Answer', { exact: true }).fill('East');
  await other.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(other.getByRole('dialog').getByText('Card saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed in another tab');
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('Compass direction?');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.getByRole('button', { name: 'Edit card', exact: true }).click();
  await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('East');
});

test('a card edited in another tab during its review comes back with the new question before any rating is saved', async ({
  page,
  pilot,
  context,
}) => {
  await signup(page, pilot.signupUrl);
  await createDeckWithCard(page, 'Botany', 'What do leaves need?', 'Light');
  const deckId = new URL(page.url()).pathname.split('/').pop();
  await page.getByRole('link', { name: 'Start review' }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  const other = await context.newPage();
  await other.goto(`/library/decks/${deckId}`);
  await editCard(other, 'What do leaves need?');
  await other.getByLabel('Question', { exact: true }).fill('What do leaves need most?');
  await other.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(other.getByRole('dialog').getByText('Card saved.', { exact: true })).toBeVisible();
  await other.close();

  await page.getByRole('button', { name: /^Good:/ }).click();

  await expect(page.getByRole('status').filter({ hasText: 'This card was edited.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What do leaves need most?', exact: true })).toBeFocused();
  const untouched = await (await page.request.get(`/api/v1/decks/${deckId}/cards`)).json();
  expect(untouched.progress).toMatchObject({ dueCards: 0, newCards: 1 });
  await rateShownCard(page, 'Light');
  await expect(page.getByRole('heading', { name: '1 card reviewed' })).toBeVisible();
  const reviewed = await (await page.request.get(`/api/v1/decks/${deckId}/cards`)).json();
  expect(reviewed.progress.newCards).toBe(0);
  expect(reviewed.progress.nextReviewDate).not.toBeNull();
});

test('a deck with paused reviews stays in Library and its reviews come back after resuming', async ({
  page,
  pilot,
}, info) => {
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Finished exam');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await addCard(page, 'First question', 'First answer');
  await addCard(page, 'Second question', 'Second answer');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const url = page.url();
  await page.getByRole('link', { name: 'Start review' }).click();
  await rateShownCard(page, 'First answer');
  await expect(page.getByRole('heading', { name: 'Second question' })).toBeVisible();
  await page.getByRole('link', { name: 'Finish for now' }).click();
  await expect(page.getByRole('link', { name: 'Continue', exact: true })).toBeVisible();
  await page.goto(url);
  await page.getByRole('button', { name: 'Deck settings' }).click();
  await page.getByRole('button', { name: 'Pause reviews' }).click();
  await expect(page.getByText('Deck paused.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start review' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume reviews' })).toHaveText('Resume');
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'No cards to review yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue', exact: true })).toHaveCount(0);
  await page.goto('/library');
  await expect(page.getByText('No active decks. Resume one from Paused, or create a deck.')).toBeVisible();
  await page.getByRole('button', { name: 'Paused 1' }).click();
  await expect(page.getByRole('link', { name: 'Open Finished exam' })).toHaveAccessibleDescription(/paused/);
  await page.getByRole('link', { name: 'Open Finished exam' }).click();
  for (const [width, scale] of [
    [1280, 100],
    [320, 200],
  ]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate((value) => {
      document.documentElement.style.fontSize = value + '%';
    }, scale);
    await page.getByRole('button', { name: 'Deck settings' }).click();
    const restore = page.getByRole('group', { name: 'Deck settings' }).getByRole('button', { name: 'Resume reviews' });
    await restore.focus();
    await expect(restore).toBeFocused();
    await restore.scrollIntoViewIfNeeded();
    await expect(restore).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: info.outputPath('archive-settings-' + width + '.png') });
    if (width === 1280) await page.getByRole('button', { name: 'Close deck settings' }).click();
    else await page.keyboard.press('Enter');
  }
  await expect(page.getByText('Deck resumed.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Start review' }).click();
  await expect(page.getByRole('heading', { name: 'Second question' })).toBeVisible();
});

test('pausing and resuming reviews protect settings while pending and survive a failed refresh', async ({
  page,
  pilot,
}) => {
  await signup(page, pilot.signupUrl);
  await page.goto('/library/decks/new');
  await page.getByLabel('Name', { exact: true }).fill('Exam prep');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await addCard(page, 'First question', 'Answer');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const settings = page.getByRole('button', { name: 'Deck settings', exact: true });
  const review = page.getByRole('link', { name: 'Start review', exact: true });
  await settings.click();
  for (const archived of [true, false]) {
    const action = page
      .getByRole('group', { name: 'Deck settings' })
      .getByRole('button', { name: archived ? 'Pause reviews' : 'Resume reviews', exact: true });
    let release!: () => void;
    const confirmation = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reportStatus!: (status: number) => void;
    const committed = new Promise<number>((resolve) => {
      reportStatus = resolve;
    });
    await page.route(
      '**/api/v1/decks/*/archive',
      async (route) => {
        const response = await route.fetch();
        reportStatus(response.status());
        await confirmation;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await page.route('**/api/v1/decks/*/cards*', (route) => route.fulfill({ status: 503, json: {} }));
    try {
      await action.click();
      expect(await committed).toBe(204);
      await expect(page.getByLabel('Name', { exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Delete deck', exact: true })).toBeDisabled();
    } finally {
      release();
    }
    await expect(page.getByText(archived ? 'Deck paused.' : 'Deck resumed.', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Couldn’t refresh');
    await expect(review).toHaveCount(archived ? 0 : 1);
    await settings.click();
    await expect(
      page
        .getByRole('group', { name: 'Deck settings' })
        .getByRole('button', { name: archived ? 'Resume reviews' : 'Pause reviews' }),
    ).toBeVisible();
    await page.unroute('**/api/v1/decks/*/cards*');
  }
});

test('Library keeps paused decks under Paused at every width and returns a resumed deck to Active', async ({
  page,
  pilot,
}, info) => {
  await signup(page, pilot.signupUrl);
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  const headers = { [csrf.headerName]: csrf.token };
  const pastBiology = 'Biology past exam with a long semester title';
  const pastPhysics = 'Physics past exam';
  const history = 'History midterm';
  const biology = 'Biology final';
  for (const title of [pastBiology, history, pastPhysics, biology]) {
    const created = await page.request.post('/api/v1/decks', { headers, data: { title } });
    expect(created.status()).toBe(201);
    if (title === pastBiology || title === pastPhysics) {
      const { id } = await created.json();
      expect((await page.request.put('/api/v1/decks/' + id + '/archive', { headers })).status()).toBe(204);
    }
  }
  for (const [width, height, scale] of [
    [320, 568, 100],
    [375, 667, 100],
    [768, 1024, 100],
    [320, 568, 200],
    [1440, 900, 100],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/library');
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size + '%';
    }, scale);
    const decks = page.getByRole('region', { name: 'My decks' });
    const active = decks.getByRole('button', { name: 'Active 2' });
    const paused = decks.getByRole('button', { name: 'Paused 2' });
    await expect(active).toHaveAttribute('aria-pressed', 'true');
    await expect(paused).toBeInViewport();
    if (width === 1440) {
      await expect(decks.getByRole('heading', { level: 3 })).toHaveText([history, biology]);
      await paused.click();
      await expect(decks.getByRole('heading', { level: 3 })).toHaveText([pastBiology, pastPhysics]);
      await page.screenshot({ path: info.outputPath('paused-grid.png') });
      await decks.getByRole('searchbox').fill('biology');
      await expect(decks.getByRole('heading', { level: 3 })).toHaveText([pastBiology]);
    } else {
      const carousel = decks.getByRole('region', { name: 'Decks', exact: true });
      const front = carousel.getByRole('link');
      await expect(front).toHaveAccessibleName('Open ' + history);
      await decks.getByRole('searchbox').fill('physics');
      await expect(decks.getByText('No active decks match. 1 paused deck matches.')).toBeVisible();
      await decks.getByRole('button', { name: 'Show paused decks' }).click();
      await expect(paused).toHaveAttribute('aria-pressed', 'true');
      await expect(front).toHaveAccessibleName('Open ' + pastPhysics);
      await expect(front).toHaveAccessibleDescription(/paused/);
      await decks.getByRole('searchbox').fill('');
      await expect(front).toHaveAccessibleName('Open ' + pastBiology);
      await expect(carousel.getByRole('button', { name: 'Next deck: ' + pastPhysics + ', paused' })).toBeVisible();
      await page.screenshot({ path: info.outputPath('paused-carousel-' + width + '-' + scale + '.png') });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.getByRole('link', { name: 'Open ' + pastBiology }).click();
  await page.getByRole('button', { name: 'Deck settings' }).click();
  await page.getByRole('group', { name: 'Deck settings' }).getByRole('button', { name: 'Resume reviews' }).click();
  await expect(page.getByText('Deck resumed.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  const decks = page.getByRole('region', { name: 'My decks' });
  await expect(decks.getByRole('button', { name: 'Active 3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(decks.getByRole('heading', { level: 3 })).toHaveText([pastBiology, biology]);
});
