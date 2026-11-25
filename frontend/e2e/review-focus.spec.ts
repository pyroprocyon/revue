import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';
import type { StudyCard } from '../src/features/study/application/reviews';

async function expectCenteredOnAnswerFace(face: Locator, answer: Locator) {
  const [faceBounds, answerBounds] = await Promise.all([face.boundingBox(), answer.boundingBox()]);
  const faceCenter = faceBounds!.y + faceBounds!.height / 2;
  const answerCenter = answerBounds!.y + answerBounds!.height / 2;
  expect(Math.abs(answerCenter - faceCenter)).toBeLessThan(1);
}

test('an empty saved review centers its message in the study layout', async ({ page }) => {
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'focus_learner' } }));
  await page.route('**/api/v1/cards/due?*', (route) =>
    route.fulfill({
      json: { totalCards: 1, availableCards: 0, dueCards: 0, newCards: 0, nextReviewDate: null, cards: [] },
    }),
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/review/deck-1/start');
    await expect(page.getByRole('heading', { name: 'No cards ready right now', exact: true })).toBeVisible();
    await expect(page.locator('.study-layout > header')).toBeHidden();
    const message = (await page.locator('.review-pause').boundingBox())!;
    expect(message.y).toBeGreaterThan(viewport.height / 4);
    await expect(page.getByRole('link', { name: 'Back to Today' })).toBeInViewport({ ratio: 1 });
  }
});

test('expanding the optional answer keeps the phone review dock in place', async ({ page }) => {
  const card = {
    id: '23',
    question: 'Question 1 about Human physiology',
    answer: 'Answer 1 for Human physiology.',
    explanation: null,
    memoryHook: null,
    source: 'Study notes',
    setTitle: 'Human physiology',
    publisherName: 'Revue',
    contentVersion: 1,
    version: 0,
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'focus_learner' } }));
  await page.route('**/api/v1/cards/due?*', (route) =>
    route.fulfill({
      json: { totalCards: 1, availableCards: 1, dueCards: 1, newCards: 0, nextReviewDate: null, cards: [card] },
    }),
  );
  await page.goto('/review/set-1');
  const toggle = page.locator('.review-draft-toggle');
  const dock = page.locator('.review-dock');
  const input = page.getByRole('textbox', { name: 'Your answer (optional)' });
  await expect(dock).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const closed = (await dock.boundingBox())!;
  await toggle.click();
  await expect(input).toBeVisible();
  const open = (await dock.boundingBox())!;
  expect(Math.abs(open.x - closed.x)).toBeLessThan(1);
  expect(Math.abs(open.y - closed.y)).toBeLessThan(1);
  await toggle.press('Enter');
  await expect(input).toBeHidden();
  expect(Math.abs((await dock.boundingBox())!.y - closed.y)).toBeLessThan(1);
});

for (const [revealAction, total, nextAction] of [
  ['I don’t know', 1, 'Finish batch'],
  ['I don’t know', 2, 'Next card'],
  ['Show answer', 2, 'Good'],
] as const) {
  test(`${revealAction} fades into ${nextAction} in the same panel`, async ({ page }) => {
    const card: StudyCard = {
      id: '23',
      question: 'What is a set?',
      answer: 'A collection with no duplicate elements.',
      explanation: null,
      memoryHook: null,
      source: null,
      setTitle: 'Collections',
      publisherName: null,
      contentVersion: 1,
      version: 0,
    };
    const cards = total === 1 ? [card] : [card, { ...card, id: '24' }];
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'focus_learner' } }));
    await page.route('**/api/v1/cards/due?*', (route) =>
      route.fulfill({
        json: { totalCards: total, availableCards: total, dueCards: total, newCards: 0, nextReviewDate: null, cards },
      }),
    );
    await page.goto('/review/set-1');
    const reveal = page.getByRole('button', { name: revealAction, exact: true });
    await expect(reveal).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const handoff = await reveal.evaluate(async (button: HTMLButtonElement) => {
      const dock = button.closest<HTMLElement>('.review-dock')!;
      const before = dock.getBoundingClientRect();
      const label = button.textContent?.trim();
      button.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const animations = dock.getAnimations({ subtree: true });
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = 40;
      }
      const outgoing = [...dock.querySelectorAll('button')]
        .find((item) => item.textContent?.trim() === label)
        ?.closest<HTMLElement>('[inert][aria-hidden="true"]');
      const after = dock.getBoundingClientRect();
      const opacity = outgoing ? Number(getComputedStyle(outgoing).opacity) : 0;
      for (const animation of animations) animation.finish();
      return { opacity, bottomShift: Math.abs(after.bottom - before.bottom) };
    });

    expect(handoff.opacity).toBeGreaterThan(0);
    expect(handoff.opacity).toBeLessThan(1);
    expect(handoff.bottomShift).toBeLessThan(1);
    await expect(reveal).toHaveCount(0);
    await expect(page.getByRole('button', { name: nextAction, exact: false })).toBeVisible();
  });
}

test('Source opens before reveal and the combined details modal follows both revealed faces', async ({
  page,
}, info) => {
  const memoryTipText = 'Picture an arrow through a membrane.';
  const explanation = 'Water moves across the membrane.\n\n'.repeat(45).trim();
  const draft = 'This is my longer recall draft.\n\n'.repeat(20).trim();
  const card = {
    id: '23',
    question: 'What is osmosis?',
    answer: 'Water crosses a selectively permeable membrane.',
    explanation,
    memoryHook: memoryTipText,
    source: 'Biology notes: https://example.org/biology',
    setTitle: 'Biology review',
    publisherName: 'Revue',
    contentVersion: 1,
    version: 0,
  };
  let pauseSession = false;
  let resumeSession!: () => void;
  const sessionWait = new Promise<void>((resolve) => {
    resumeSession = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/me') {
      if (pauseSession) await sessionWait;
      return route.fulfill({ json: { username: 'focus_learner' } });
    }
    if (path.split('?')[0] === '/api/v1/cards/due')
      return route.fulfill({
        json: { totalCards: 1, availableCards: 1, dueCards: 1, newCards: 0, nextReviewDate: null, cards: [card] },
      });
    return route.fulfill({ status: 404 });
  });
  const cardFrame = page.locator('[data-card-frame]');
  const questionLabel = cardFrame.locator('.review-front .review-strip p');
  const details = cardFrame.getByRole('button', { name: 'Card details', exact: true });
  const detailsDialog = page.getByRole('dialog', { name: 'Card details' });
  const source = cardFrame.getByRole('button', { name: 'Source', exact: true });
  const sourceDialog = page.getByRole('dialog', { name: 'Source' });
  try {
    for (const [width, height, enlarged] of [
      [375, 667, false],
      [768, 900, false],
      [1366, 900, false],
      [844, 390, false],
      [320, 568, true],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: enlarged ? 'reduce' : 'no-preference' });
      await page.goto('/review/set-1');
      if (enlarged) await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      await expect(questionLabel).toHaveText('Card 1 of 1');
      await page.getByText('Write an answer', { exact: false }).click();
      await page.getByRole('textbox', { name: 'Your answer (optional)' }).fill(draft);
      await expect(details).toHaveCount(0);
      await expect(source).toBeVisible();
      await expect(page.getByText('Published by Revue', { exact: true })).toBeVisible();
      await source.press('Enter');
      await expect(sourceDialog.getByRole('link', { name: 'Biology notes' })).toBeVisible();
      await sourceDialog.getByRole('button', { name: 'Done' }).press('Enter');
      await expect(source).toBeFocused();
      await page.getByRole('button', { name: 'Show answer' }).press('Enter');
      await expect(page.getByRole('heading', { name: card.answer, exact: true })).toBeFocused();
      await expect(details).toBeVisible();
      await expect(detailsDialog).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Biology notes' })).toHaveCount(0);
      await cardFrame.evaluate((element) =>
        Promise.allSettled(element.getAnimations().map((animation) => animation.finished)),
      );
      const answerFace = cardFrame.locator('.review-back');
      const answer = page.getByRole('heading', { name: card.answer, exact: true });
      await expect(answerFace.locator('.review-strip p')).toHaveText('Answer');
      await expect(answerFace).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(answerFace).toHaveCSS('box-shadow', /rgb\(165, 216, 255\).*1\.5px inset/);
      await expect(answerFace.locator('.review-strip')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(answer).toHaveCSS('color', 'rgb(33, 37, 41)');
      await expect(details).toHaveCSS('color', 'rgb(24, 100, 171)');
      await expect(answerFace.getByRole('button', { name: 'Back to question' })).toHaveCSS(
        'color',
        'rgb(24, 100, 171)',
      );
      await expectCenteredOnAnswerFace(answerFace, answer);
      const frame = (await cardFrame.boundingBox())!;
      await details.press('Enter');
      await expect(detailsDialog.getByRole('link', { name: 'Biology notes' })).toBeVisible();
      await expect(detailsDialog.getByText(memoryTipText, { exact: true })).toBeVisible();
      await expect(detailsDialog.getByText(explanation, { exact: true })).toBeVisible();
      expect(await cardFrame.evaluate((element) => element.clientHeight)).toBe(Math.round(frame.height));
      await detailsDialog.getByRole('button', { name: 'Done' }).press('Enter');
      await expect(details).toBeFocused();
      await expect(detailsDialog).toHaveCount(0);

      const compare = page.getByRole('button', { name: 'Compare with your answer' });
      const comparison = page.getByRole('dialog', { name: 'Compare with your answer' });
      await compare.press('Enter');
      await expect(comparison.getByText(card.answer, { exact: true })).toBeVisible();
      await expect(comparison.getByText(draft.split('\n')[0], { exact: false })).toBeVisible();
      await comparison.getByRole('button', { name: 'Done' }).press('Enter');
      await expect(compare).toBeFocused();

      await page.getByRole('button', { name: 'Back to question' }).press('Enter');
      await expect(questionLabel).toBeVisible();
      await expect(questionLabel).toHaveText('Card 1 of 1');
      await details.press('Enter');
      await expect(detailsDialog.getByText(memoryTipText, { exact: true })).toBeVisible();
      await expect(detailsDialog.getByRole('link', { name: 'Biology notes' })).toHaveAttribute(
        'href',
        'https://example.org/biology',
      );
      await expect(detailsDialog.getByRole('button', { name: 'Done' })).toBeInViewport({ ratio: 1 });
      await detailsDialog.getByRole('button', { name: 'Done' }).press('Enter');
      await expect(details).toBeFocused();
      await page.getByRole('button', { name: 'Back to answer' }).press('Enter');
      await expect(answer).toBeFocused();
      await expect(details).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`compact-review-${width}.png`), fullPage: true });
    }

    await details.press('Enter');
    await expect(detailsDialog).toBeVisible();
    pauseSession = true;
    await page.clock.setFixedTime(new Date((await page.evaluate(() => Date.now())) + 30_000));
    const sessionRequest = page.waitForRequest('**/api/v1/me');
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await sessionRequest;
    await expect(detailsDialog).toHaveCount(0);
    resumeSession();
    await expect(details).toBeFocused();
  } finally {
    resumeSession();
  }
});

test('small phones compact long answers so every rating fits, and larger screens keep the full size', async ({
  page,
}, info) => {
  const shared = {
    id: '23',
    memoryHook: 'A short tip.',
    explanation: 'A short explanation.',
    source: null,
    setTitle: 'Science quick review',
    publisherName: null,
    contentVersion: 1,
    version: 0,
  };
  const cards = {
    short: {
      ...shared,
      question: 'What does a plant need for photosynthesis?',
      answer: 'Light energy, water and carbon dioxide.',
    },
    long: {
      ...shared,
      question: 'What is osmosis?',
      answer: 'Water moving across a selectively permeable membrane from lower to higher solute concentration.',
    },
  };
  let card = cards.short;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/me') return route.fulfill({ json: { username: 'phone_learner' } });
    if (path.split('?')[0] === '/api/v1/cards/due')
      return route.fulfill({
        json: { totalCards: 1, availableCards: 1, dueCards: 1, newCards: 0, nextReviewDate: null, cards: [card] },
      });
    return route.fulfill({ status: 404 });
  });
  for (const { width, height, answer, fontSize, fitsScreen } of [
    { width: 375, height: 667, answer: 'short', fontSize: '28px', fitsScreen: true },
    { width: 375, height: 667, answer: 'long', fontSize: '20px', fitsScreen: true },
    { width: 360, height: 640, answer: 'short', fontSize: '28px', fitsScreen: true },
    { width: 360, height: 744, answer: 'long', fontSize: '28px', fitsScreen: false },
    { width: 390, height: 844, answer: 'long', fontSize: '28px', fitsScreen: true },
    { width: 768, height: 1024, answer: 'long', fontSize: '32px', fitsScreen: true },
  ] as const) {
    card = cards[answer];
    await page.setViewportSize({ width, height });
    await page.goto('/review/set-1');
    const frame = page.locator('.review-card-frame');
    await expect(frame).toBeVisible();
    const questionFrame = await frame.boundingBox();
    await page.getByRole('button', { name: 'Show answer' }).click();
    const heading = page.getByRole('heading', { name: card.answer, exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveCSS('font-size', fontSize);
    const cardFrame = page.locator('[data-card-frame]');
    await cardFrame.evaluate((element) =>
      Promise.allSettled(element.getAnimations().map((animation) => animation.finished)),
    );
    await expectCenteredOnAnswerFace(cardFrame.locator('.review-back'), heading);
    if (width === 390) {
      const dock = page.locator('.review-dock-after-reveal');
      await expect(dock).toHaveCSS('padding', '10px');
      await expect(dock.locator('.review-rating-grid')).toHaveCSS('column-gap', '6px');
      await expect(dock.getByRole('button', { name: /^Missed:/ })).toHaveCSS('padding-block-start', '8px');
    }
    if (width === 768) {
      expect(questionFrame!.height).toBeGreaterThan(380);
      expect(await frame.boundingBox()).toEqual(questionFrame);
      const dock = (await page.locator('.review-dock').boundingBox())!;
      expect(dock.y).toBeGreaterThanOrEqual(questionFrame!.y + questionFrame!.height);
    }
    if (!fitsScreen) continue;
    await expect(page.getByRole('button', { name: 'Card details' })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    for (const rating of [/^Missed:/, /^Hard:/, /^Good:/, /^Easy:/]) {
      await expect(page.getByRole('button', { name: rating })).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: info.outputPath(`review-${width}x${height}-${answer}.png`) });
  }
});

test('worst-case cards keep ratings reachable, read as paragraphs and open at their start', async ({ page }, info) => {
  const sentence = 'Water moves across the membrane toward the side with more dissolved particles. ';
  const shared = {
    id: '23',
    explanation: null,
    memoryHook: null,
    source: null,
    setTitle: 'Biology review',
    publisherName: null,
    contentVersion: 1,
    version: 0,
  };
  const longQuestion = sentence.repeat(6).trim();
  let card: StudyCard = {
    ...shared,
    question: longQuestion,
    answer: 'It swells and bursts.',
    explanation: sentence.repeat(12).trim(),
  };
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/me') return route.fulfill({ json: { username: 'worst_case_learner' } });
    if (path.split('?')[0] === '/api/v1/cards/due')
      return route.fulfill({
        json: { totalCards: 1, availableCards: 1, dueCards: 1, newCards: 0, nextReviewDate: null, cards: [card] },
      });
    return route.fulfill({ status: 404 });
  });
  const answerHeading = page.locator('[data-card-frame] > section').nth(1).locator('h2[tabindex="-1"]');

  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/review/set-1');
  await page.getByRole('button', { name: 'Show answer' }).click();
  const ratings = page.getByRole('group', { name: 'Rate your answer' });
  const details = page.getByRole('button', { name: 'Card details' });
  const reading = page.locator('.review-card-content');
  await expect(reading).toHaveCSS('overflow-y', 'auto');
  await reading.evaluate((element) => (element.scrollTop = element.scrollHeight));
  await details.click();
  const dialog = page.getByRole('dialog', { name: 'Card details' });
  await expect(dialog.getByText(card.explanation!.trim(), { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(details).toBeFocused();
  expect(await reading.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(ratings).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('link', { name: 'Finish for now' })).toBeInViewport({ ratio: 1 });
  for (const rating of [/^Missed:/, /^Hard:/, /^Good:/, /^Easy:/]) {
    const button = page.getByRole('button', { name: rating });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport({ ratio: 1 });
  }

  card = { ...shared, question: longQuestion, answer: sentence.repeat(12).trim() };
  for (const [width, height, fontSize] of [
    [320, 568, '18px'],
    [768, 1024, '20px'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/review/set-1');
    await page.getByText('Write an answer', { exact: false }).click();
    await page.getByRole('textbox', { name: 'Your answer (optional)' }).fill(sentence.repeat(20));
    await page.getByRole('button', { name: 'Show answer' }).click();
    await expect(answerHeading).toBeFocused();
    await expect(answerHeading).toHaveCSS('text-align', 'left');
    await expect(answerHeading).toHaveCSS('font-size', fontSize);
    await expect(page.getByText('Answer', { exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`review-paragraph-${width}.png`) });
    await page.getByRole('button', { name: 'Back to question' }).click();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    const compare = page.getByRole('button', { name: 'Compare with your answer' });
    await compare.click();
    const comparison = page.getByRole('dialog', { name: 'Compare with your answer' });
    await expect(comparison.getByText(sentence.repeat(20).trim(), { exact: true })).toBeVisible();
    expect(await comparison.evaluate((dialog) => dialog.scrollTop)).toBe(0);
    await comparison.getByRole('button', { name: 'Done' }).press('Enter');
    await expect(compare).toBeFocused();
  }

  card = { ...shared, question: '2 + 6?', answer: '8' };
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/review/set-1');
  const frame = page.locator('.review-card-frame');
  await expect(frame).toHaveCSS('height', '276px');
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  const enlargedHeight = await frame.evaluate((element) => element.clientHeight);
  await page.getByRole('button', { name: 'Show answer' }).click();
  expect(await frame.evaluate((element) => element.clientHeight)).toBe(enlargedHeight);
});

for (const { questionLines, answerLines, motion, fits } of [
  { questionLines: 100, answerLines: 30, motion: 'no-preference', fits: false },
  { questionLines: 100, answerLines: 30, motion: 'reduce', fits: false },
  { questionLines: 11, answerLines: 8, motion: 'no-preference', fits: true },
] as const) {
  test(`phone reveal makes ${answerLines} answer lines readable after ${questionLines} question lines (${motion})`, async ({
    page,
  }) => {
    const card: StudyCard = {
      id: '23',
      question: Array<string>(questionLines).fill('Q').join('\n'),
      answer: Array<string>(answerLines).fill('A').join('\n'),
      explanation: null,
      memoryHook: null,
      source: null,
      setTitle: 'Review layout',
      publisherName: null,
      contentVersion: 1,
      version: 0,
    };
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: motion });
    await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'focus_learner' } }));
    await page.route('**/api/v1/cards/due?*', (route) =>
      route.fulfill({
        json: { totalCards: 1, availableCards: 1, dueCards: 1, newCards: 0, nextReviewDate: null, cards: [card] },
      }),
    );
    await page.goto('/review/set-1');
    await page.getByRole('button', { name: 'Show answer' }).click();
    const answer = page.locator('.review-back h2');
    await expect(answer).toBeFocused();
    const bounds = await answer.evaluate(async (heading) => {
      const reading = heading.closest<HTMLElement>('.review-card-content')!;
      const review = reading.parentElement!;
      await Promise.all(review.getAnimations({ subtree: true }).map((animation) => animation.finished));
      const viewport = reading.getBoundingClientRect();
      const text = heading.getBoundingClientRect();
      return {
        start: text.top - viewport.top,
        end: viewport.bottom - text.bottom,
        firstLine: viewport.bottom - text.top - Number.parseFloat(getComputedStyle(heading).lineHeight),
      };
    });
    expect(bounds.start).toBeGreaterThanOrEqual(-1);
    expect(bounds.firstLine).toBeGreaterThanOrEqual(0);
    if (fits) expect(bounds.end).toBeGreaterThanOrEqual(-1);
  });
}

test('long answers size both faces before reveal and scroll with the page', async ({ page }) => {
  const sentence = 'Water moves across the membrane toward the side with more dissolved particles. ';
  const card = {
    id: '23',
    question: sentence.repeat(2).trim(),
    answer: sentence.repeat(5).trim(),
    explanation: null,
    memoryHook: null,
    source: null,
    setTitle: 'Biology review',
    publisherName: null,
    contentVersion: 1,
    version: 0,
  };
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/me') return route.fulfill({ json: { username: 'enlarged_text_learner' } });
    if (path.split('?')[0] === '/api/v1/cards/due')
      return route.fulfill({
        json: { totalCards: 1, availableCards: 1, dueCards: 1, newCards: 0, nextReviewDate: null, cards: [card] },
      });
    return route.fulfill({ status: 404 });
  });
  const frame = page.locator('.review-card-frame');
  const showAnswer = page.getByRole('button', { name: 'Show answer' });
  const scrollsInside = (side: 'Question' | 'Answer') =>
    page.getByRole('region', { name: side, exact: true }).evaluate((area) => area.scrollHeight > area.clientHeight + 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const [width, height, textSize] of [
    [320, 568, '100%'],
    [375, 667, '100%'],
    [320, 568, '200%'],
    [390, 844, '200%'],
    [768, 1024, '100%'],
    [1440, 900, '200%'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/review/set-1');
    await page.evaluate((size) => (document.documentElement.style.fontSize = size), textSize);
    await expect(showAnswer).toBeVisible();
    await expect(page.getByRole('heading', { name: card.answer })).toHaveCount(0);
    const initialHeight = await frame.evaluate((element) => element.clientHeight);
    expect(initialHeight).toBeGreaterThan(276);
    expect(await scrollsInside('Question'), `question at ${width} px`).toBe(false);
    await showAnswer.click();
    expect(await scrollsInside('Answer'), `answer at ${width} px`).toBe(false);
    expect(await frame.evaluate((element) => element.clientHeight)).toBe(initialHeight);
    const rating = page.getByRole('button', { name: /^Good:/ });
    await rating.scrollIntoViewIfNeeded();
    await expect(rating).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: 'Back to question' }).click();
    expect(await frame.evaluate((element) => element.clientHeight)).toBe(initialHeight);
    await page.getByRole('button', { name: 'Back to answer' }).click();
    expect(await frame.evaluate((element) => element.clientHeight)).toBe(initialHeight);
  }
});

// Controlled API timing exercises browser focus and inert behavior in the production frontend.
for (const { cardCount, focusExit } of [
  { cardCount: 1, focusExit: false },
  { cardCount: 2, focusExit: false },
  { cardCount: 2, focusExit: true },
]) {
  const target = cardCount === 1 ? 'completion' : 'next question';
  test(`a rating finishing during session verification ${focusExit ? 'keeps focus on the chosen exit' : `focuses the ${target}`}`, async ({
    page,
  }) => {
    const card = {
      id: '23',
      question: 'First question',
      answer: 'First answer',
      explanation: null,
      memoryHook: null,
      source: '',
      setTitle: 'Study set',
      publisherName: 'Revue',
      contentVersion: 1,
      version: 0,
    };
    let saved = false;
    let checkSession = false;
    let releaseSession!: () => void;
    let releaseRating!: () => void;
    const sessionWait = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });
    const ratingWait = new Promise<void>((resolve) => {
      releaseRating = resolve;
    });
    let queueReads = 0;
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/me') {
        if (checkSession) await sessionWait;
        return route.fulfill({ json: { username: 'focus_learner' } });
      }
      if (path === '/api/v1/auth/csrf') {
        return route.fulfill({
          json: { token: 'test-form-token', headerName: 'X-XSRF-TOKEN', username: 'focus_learner' },
        });
      }
      if (path.split('?')[0] === '/api/v1/cards/due') {
        queueReads += 1;
        const cards = cardCount === 1 ? [card] : [card, { ...card, id: '24', question: 'Second question' }];
        return route.fulfill({
          json: {
            totalCards: cardCount,
            availableCards: cardCount,
            dueCards: 0,
            newCards: saved ? cardCount - 1 : cardCount,
            nextReviewDate: saved ? '2026-11-15' : null,
            cards: saved ? cards.slice(1) : cards,
            topics: [],
          },
        });
      }
      if (path === '/api/v1/reviews/23') {
        const input = route.request().postDataJSON();
        await ratingWait;
        saved = true;
        return route.fulfill({
          json: {
            cardId: card.id,
            requestId: input.requestId,
            scheduleVersion: 1,
            reviewedAt: '2026-11-14T00:00:00Z',
            recommendedReviewDate: '2026-11-15',
            nextReviewDate: '2026-11-15',
          },
        });
      }
      return route.fulfill({ status: 404 });
    });
    try {
      await page.clock.setFixedTime(new Date());
      await page.goto('/review/set-1/start');
      await expect(page.getByRole('heading', { name: 'First question', exact: true })).toBeFocused();
      await page.getByRole('button', { name: 'Show answer' }).click();
      const ratingRequest = page.waitForRequest('**/api/v1/reviews/23');
      await page.getByRole('button', { name: /^Good:/ }).click();
      await ratingRequest;
      checkSession = true;
      await page.clock.setFixedTime(new Date((await page.evaluate(() => Date.now())) + 30_000));
      const sessionRequest = page.waitForRequest('**/api/v1/me');
      await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        window.dispatchEvent(new Event('focus'));
      });
      await sessionRequest;
      await expect
        .poll(() =>
          page
            .locator('main h2')
            .first()
            .evaluate((element) => element.closest('[inert]') !== null),
        )
        .toBe(true);
      releaseRating();
      const heading = page.locator('h2').filter({ hasText: cardCount === 1 ? '1 card reviewed' : 'Second question' });
      await expect(heading).toBeVisible();
      await expect(heading).not.toBeFocused();
      const exit = page.getByRole('link', { name: 'Finish for now', exact: true });
      if (focusExit) await exit.focus();
      releaseSession();
      await expect
        .poll(() =>
          page
            .locator('main h2')
            .first()
            .evaluate((element) => element.closest('[inert]') !== null),
        )
        .toBe(false);
      await expect(focusExit ? exit : heading).toBeFocused();
      expect(queueReads).toBe(cardCount === 1 ? 3 : 1);
    } finally {
      releaseRating();
      releaseSession();
    }
  });
}
