import type { Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';
import { historyCards, historySet } from '../src/test/fixtures';

test('practice preview pairs the trial with the sample on tablet and docks it on phones', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: async () => {} });
  });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/sets/philippine-history');
  const trial = page.getByRole('link', { name: 'Try 5 cards' });
  const dock = page.getByRole('group', { name: 'Reviewer actions' });
  const description = page.getByText(/from Mactan to Malolos/);
  const sample = page.getByRole('heading', { name: 'Sample question' });
  const share = page.getByRole('button', { name: 'Share', exact: true });
  const copy = page.getByRole('button', { name: 'Copy link' });
  await expect(page.getByText('Trial progress and ratings aren’t saved.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in to save' })).toHaveCount(0);
  await expect(sample).toBeVisible();
  await expect(trial).toHaveCSS('background-image', /^linear-gradient\(/);
  await expect(dock).toHaveCSS('backdrop-filter', 'none');
  await page.evaluate(() => document.fonts.ready);

  const tabletTrial = (await trial.boundingBox())!;
  const tabletSample = (await sample.boundingBox())!;
  const tabletDescription = (await description.boundingBox())!;
  const introCard = (await page.locator('.set-detail-header').boundingBox())!;
  const sampleCard = (await page.locator('.set-detail-sample').boundingBox())!;
  expect(introCard.x).toBe(32);
  expect(640 - sampleCard.x - sampleCard.width).toBe(32);
  expect(tabletSample.x).toBeGreaterThan(tabletDescription.x + tabletDescription.width);
  expect(tabletTrial.x).toBeGreaterThan(tabletDescription.x + tabletDescription.width);
  expect(tabletTrial.y).toBeGreaterThan(tabletSample.y + tabletSample.height);

  await page.setViewportSize({ width: 375, height: 667 });
  await expect(dock).toHaveCSS('backdrop-filter', /^blur\(/);
  await expect(trial).toBeInViewport({ ratio: 1 });
  const sharing = (await share.boundingBox())!;
  const copyLink = (await copy.boundingBox())!;
  const phoneTrial = (await trial.boundingBox())!;
  expect(copyLink.y).toBe(sharing.y);
  expect(phoneTrial.y).toBeGreaterThan(sharing.y + sharing.height);
  expect(phoneTrial.y + phoneTrial.height).toBeGreaterThan(600);
  for (const control of [trial, share, copy]) await expectTouchTarget(control);

  await page.setViewportSize({ width: 320, height: 568 });
  await expect(trial.locator('..')).toHaveCSS('position', 'sticky');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(trial.locator('..')).toHaveCSS('position', 'static');
  await expect(dock).toHaveCSS('backdrop-filter', 'none');
  await copy.scrollIntoViewIfNeeded();
  await expect(copy).toBeInViewport({ ratio: 1 });
});

test('Privacy and Terms pin the sign-in link only when the phone has room', async ({ page }) => {
  for (const path of ['/privacy', '/terms']) {
    await page.setViewportSize({ width: 360, height: 744 });
    await page.goto(path);
    const back = page.getByRole('link', { name: 'Back to sign in', exact: true });
    await expect(back).toBeInViewport({ ratio: 1 });
    const content = page.getByRole('main');
    expect(await content.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');

    await page.setViewportSize({ width: 360, height: 480 });
    expect(await content.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
    await back.scrollIntoViewIfNeeded();
    await expect(back).toBeInViewport({ ratio: 1 });

    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await content.evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await back.scrollIntoViewIfNeeded();
    await expect(back).toBeInViewport({ ratio: 1 });
  }
});

test('public pages share tablet gutters and a desktop max width', async ({ page }) => {
  const routes = [
    ['/', 'Review before it’s due.'],
    ['/how-it-works', 'How spaced repetition works'],
    ['/sets', 'Reviewers'],
    ['/sets/philippine-history', 'Philippine History'],
    ['/sign-in', 'Welcome back'],
    ['/help', 'Help'],
    ['/terms', 'Terms'],
  ] as const;

  for (const width of [912, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, level: 1, exact: true })).toBeAttached();
      const main = page.locator('main.reading-column, main > .reading-column');
      const columns = await main.evaluate((element) => {
        const header = document.querySelector('header.reading-column')!;
        return [header, element].map((column) => {
          const { x, width } = column.getBoundingClientRect();
          const { paddingLeft, paddingRight } = getComputedStyle(column);
          return { x, width, paddingLeft, paddingRight };
        });
      });
      const frameWidth = Math.min(width, 1024);
      for (const column of columns) {
        expect(column, `${route} at ${width}px`).toEqual({
          x: (width - frameWidth) / 2,
          width: frameWidth,
          paddingLeft: '32px',
          paddingRight: '32px',
        });
      }
    }
  }
});

test('tablet trial keeps recall and rating controls close to the card', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/sets/philippine-history/try');
  const check = page.getByRole('button', { name: 'Show answer', exact: true });
  await expect(check).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect((await check.boundingBox())!.y).toBeLessThan(700);
  await check.click();
  for (const rating of ['Missed', 'Hard', 'Good', 'Easy']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${rating}:`) })).toBeInViewport({ ratio: 1 });
  }
});

const withVisibleScrollbars = test.extend({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

withVisibleScrollbars(
  'trial and saved review share a centered study width and aligned controls',
  async ({ page, pilot }) => {
    pilot.addSaveableSet();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(pilot.signupUrl);
    await page.getByLabel('Username').fill(`study_layout_${randomUUID().slice(0, 16)}`);
    await page.getByLabel('Password', { exact: true }).fill('mango42');
    await page.getByLabel('Confirm password').fill('mango42');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.goto('/sets/published-test-set');
    await page.getByRole('button', { name: 'Save to Library' }).click();
    await expect(page.getByText('Saved to your Library')).toBeVisible();
    await page.goto('/library');
    await page.getByRole('link', { name: 'Open Published test set' }).click();
    const start = page.getByRole('link', { name: 'Start review: Published test set', exact: true });
    await expect(start).toBeVisible();
    const reviewPath = (await start.getAttribute('href'))!;
    const measure = async (path: string) => {
      await page.goto(path);
      await page.getByRole('button', { name: 'Show answer', exact: true }).click();
      await expect(page.getByRole('group', { name: 'Rate your answer' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      return page.locator('.review-card-frame').evaluate((card) => {
        const { x, y, width } = card.getBoundingClientRect();
        const dock = document.querySelector('.review-dock')!;
        const dockBounds = dock.getBoundingClientRect();
        return {
          availableWidth: document.documentElement.clientWidth,
          cardLeft: x,
          cardTop: y + window.scrollY,
          cardWidth: width,
          dockLeft: dockBounds.x,
          dockWidth: dockBounds.width,
          dockShadow: getComputedStyle(dock).boxShadow,
        };
      });
    };
    for (const width of [640, 655, 768, 1024, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      const trial = await measure('/sets/philippine-history/try');
      const review = await measure(reviewPath);
      const cardWidth = Math.min(trial.availableWidth - 64, 640);
      expect(trial.availableWidth).toBeLessThan(width);
      expect(trial.cardLeft).toBe((trial.availableWidth - cardWidth) / 2);
      expect(trial.cardWidth).toBe(cardWidth);
      expect(trial.dockLeft).toBe(trial.cardLeft);
      expect(trial.dockWidth).toBe(cardWidth);
      expect(trial.dockShadow).not.toBe('none');
      expect(review).toEqual(trial);
    }
  },
);

test('landing action and study headings fit at 320 pixels with 200% text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const title = page.getByRole('heading', { name: 'Review before it’s due.' });
  await expectWordOnOneLine(title, 'Review');
  await expectWordOnOneLine(title, 'before');
  await expectWordOnOneLine(page.getByText('Tomorrow', { exact: true }), 'Tomorrow');
  const browse = page.getByRole('link', { name: 'Browse reviewers' });
  // Check the initial screen before click scrolls the link into view.
  await expect(browse).toBeInViewport({ ratio: 1 });
  await browse.click();
  await expectWordOnOneLine(page.getByText('Philippine History', { exact: true }), 'Philippine');
  await page.getByRole('link', { name: /^Philippine History/ }).click();
  await expectWordOnOneLine(page.getByRole('heading', { name: 'Philippine History' }), 'Philippine');
  await page.getByRole('link', { name: 'Try 5 cards' }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  const answer = page.getByRole('heading', { name: 'Lapulapu, the chief of Mactan' });
  await expectWordOnOneLine(answer, 'Lapulapu,');
  await expectWordOnOneLine(answer, 'Mactan');
  expect(await page.getByRole('main').evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByText('Card 2 of 5', { exact: true })).toBeVisible();
});

test('account help and trial source links offer a 48-pixel target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sign-in');
  await expectTouchTarget(page.getByRole('link', { name: 'Contact support' }));
  await page.goto('/register');
  await expectTouchTarget(page.getByRole('link', { name: 'Sign in', exact: true }));
  await page.goto('/sets/philippine-history/try');
  await page.getByRole('button', { name: 'Show answer' }).click();
  const details = page.getByRole('button', { name: 'Card details' });
  await expectTouchTarget(details);
  await details.click();
  const dialog = page.getByRole('dialog', { name: 'Card details' });
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(['Explanation', 'Source']);
  await expect(dialog.locator(':scope > div').first()).toHaveCSS('padding-inline-start', '24px');
  await expect(dialog.locator(':scope > div').last()).toHaveCSS('padding-inline-start', '24px');
  const done = dialog.getByRole('button', { name: 'Done' });
  await expect(done).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(done).toHaveCSS('border-top-style', 'solid');
  await expectTouchTarget(done);
  const gutterDifference = () =>
    done.evaluate((button) => {
      const dialogBounds = button.closest('dialog')!.getBoundingClientRect();
      const buttonBounds = button.getBoundingClientRect();
      const top = buttonBounds.top - dialogBounds.top;
      const right = dialogBounds.right - buttonBounds.right;
      return Math.abs(top - right);
    });
  expect(await gutterDifference()).toBeLessThan(1);
  const source = dialog.getByRole('link', { name: 'NHCP historical marker' });
  await expectTouchTarget(source);
  await expect(source).toBeInViewport({ ratio: 1 });

  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectWordOnOneLine(dialog.getByRole('heading', { name: 'Card details' }), 'details');
  await source.scrollIntoViewIfNeeded();
  await expect(done).toBeInViewport({ ratio: 1 });
  expect(await gutterDifference()).toBeLessThan(1);
});

test('invitation and guide text keep room for whole words at 320 pixels with 200% text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/join');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectWordOnOneLine(page.getByRole('heading', { name: 'You’ll need an invitation' }), 'invitation');
  await page.getByRole('link', { name: 'Browse reviewers' }).click();
  await expect(page.getByRole('heading', { name: 'Reviewers' })).toBeVisible();
  await page.goto('/how-it-works');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expectWordOnOneLine(page.getByRole('heading', { name: 'How spaced repetition works' }), 'repetition');
  await expectWordOnOneLine(page.getByText('Answer from memory.', { exact: true }), 'Answer');
  await expectWordOnOneLine(page.getByText('Practice again later.', { exact: true }), 'Practice');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('the compact trial bar gives long answers their own scroll area on phones', async ({ page }, info) => {
  const answer = 'The JVM takes bytecode and runs it on the current platform. '.repeat(18).trim();
  const cards = [{ ...historyCards.cards[0]!, answer }, ...historyCards.cards.slice(1)];
  await page.route('**/demo-cards', (route) => route.fulfill({ json: { ...historyCards, cards } }));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sets/philippine-history/try');
  const hint = page.getByText('Trial · Progress isn’t saved');
  const frame = page.locator('.review-card-frame');
  await expect(page.getByText('Card 1 of 5', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const [hintBounds, frameBounds] = await Promise.all([hint.boundingBox(), frame.boundingBox()]);
  expect(frameBounds!.y - hintBounds!.y - hintBounds!.height).toBeGreaterThanOrEqual(9);
  await page.getByRole('button', { name: 'Show answer' }).click();
  const reading = page.locator('.review-card-content');
  const ratings = page.getByRole('group', { name: 'Rate your answer' });
  await expect(reading).toHaveCSS('overflow-y', 'auto');
  await expect(ratings.getByText('Right after a pause', { exact: true })).toBeVisible();
  const dock = (await ratings.boundingBox())!;
  const buttons = await ratings.getByRole('button').all();
  for (const button of buttons) {
    await expect(button).toBeInViewport({ ratio: 1 });
    const bounds = (await button.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(48);
    expect(bounds.height).toBeGreaterThanOrEqual(48);
    expect(bounds.y).toBe((await buttons[0]!.boundingBox())!.y);
  }
  await reading.evaluate((element) => (element.scrollTop = element.scrollHeight));
  const details = page.getByRole('button', { name: 'Card details' });
  await expect(details).toBeInViewport({ ratio: 1 });
  expect((await details.boundingBox())!.y + (await details.boundingBox())!.height).toBeLessThanOrEqual(dock.y);
  expect(await ratings.boundingBox()).toEqual(dock);
  await details.click();
  const dialog = page.getByRole('dialog', { name: 'Card details' });
  await expect(dialog.getByText('Note 1.')).toBeVisible();
  await expect(dialog.getByText(/Grade 6 book/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('compact-trial-details.png') });
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(details).toBeFocused();
  await page.screenshot({ path: info.outputPath('compact-trial-phone.png') });

  await page.setViewportSize({ width: 768, height: 920 });
  await expect(reading).toHaveCSS('overflow-y', 'visible');
  await expect(ratings.getByText('Right, with a pause', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  await expect(reading).toHaveCSS('overflow-y', 'visible');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await ratings.getByRole('button', { name: /^Good:/ }).click();
  await expect(page.getByText('Card 2 of 5', { exact: true })).toBeVisible();
});

test('keyboard reveal and tabbing keep enlarged answers and ratings reachable with either motion setting', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/sets/philippine-history/try');
    const show = page.getByRole('button', { name: 'Show answer', exact: true });
    await expect(show).toBeVisible();
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = '200%';
      await document.fonts.ready;
    });
    await show.focus();
    await page.keyboard.press('Enter');
    const answer = page.getByRole('heading', { name: 'Lapulapu, the chief of Mactan' });
    await expect(answer).toBeFocused();
    await expect(answer).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Card details' })).toBeFocused();
    for (const rating of ['Missed', 'Hard', 'Good', 'Easy']) {
      await page.keyboard.press('Tab');
      const button = page.getByRole('button', { name: new RegExp(`^${rating}:`) });
      await expect(button).toBeFocused();
      // Native focus scrolling can round a fractional CSS-pixel edge at the viewport boundary.
      await expect
        .poll(async () => {
          const bounds = await button.boundingBox();
          return bounds !== null && bounds.y >= -1 && bounds.y + bounds.height <= 569;
        })
        .toBe(true);
    }
    await page.keyboard.press('Enter');
    await expect(page.getByText('Card 2 of 5', { exact: true })).toBeVisible();
  }
});

test('rapid flip reversals start at the current angle on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/sets/philippine-nature/try');
  const card = page.locator('.transform-3d');
  const angleAt = (progress: number) =>
    card.evaluate((element, fraction) => {
      const animations = element.getAnimations();
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = Number(animation.effect!.getTiming().duration) * fraction;
      }
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return (Math.atan2(matrix.m31, matrix.m11) * 180) / Math.PI;
    }, progress);

  await page.getByRole('button', { name: 'Show answer' }).press('Enter');
  const turningToAnswer = await angleAt(0.7);
  expect(turningToAnswer).toBeGreaterThan(90);
  expect(turningToAnswer).toBeLessThan(178);
  await page.getByRole('button', { name: 'Back to question' }).press('Enter');
  expect(Math.abs((await angleAt(0)) - turningToAnswer)).toBeLessThan(2);

  const turningToQuestion = await angleAt(0.7);
  expect(turningToQuestion).toBeGreaterThan(2);
  expect(turningToQuestion).toBeLessThan(90);
  await page.getByRole('button', { name: 'Back to answer' }).press('Enter');
  expect(Math.abs((await angleAt(0)) - turningToQuestion)).toBeLessThan(2);
});

for (const [width, height] of [
  [320, 568],
  [360, 600],
  [375, 667],
] as const) {
  test(`revealing a phone trial expands the rating dock without a jump or clipping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/sets/philippine-history/try');
    const show = page.getByRole('button', { name: 'Show answer' });
    await expect(show).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const frames = await show.evaluate(async (button: HTMLButtonElement) => {
      const dock = document.querySelector<HTMLElement>('.review-dock')!;
      const card = document.querySelector<HTMLElement>('[data-card-frame]')!;
      const content = document.querySelector<HTMLElement>('.review-card-content')!;
      const before = dock.getBoundingClientRect();
      button.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const resize = dock.getAnimations().find((animation) => animation.effect?.getTiming().duration !== 0);
      resize?.pause();
      const measureDock = (fraction: number) => {
        if (resize?.effect) resize.currentTime = Number(resize.effect.getTiming().duration) * fraction;
        return dock.getBoundingClientRect();
      };
      const start = measureDock(0);
      const middle = measureDock(0.5);
      const end = measureDock(1);
      const flip = card.getAnimations()[0];
      flip.pause();
      const topClearance = [0.25, 0.5, 0.75].map((progress) => {
        flip.currentTime = Number(flip.effect!.getTiming().duration) * progress;
        return card.getBoundingClientRect().top - content.getBoundingClientRect().top;
      });
      return {
        before: before.height,
        start: start.height,
        middle: middle.height,
        end: end.height,
        bottomShift: Math.max(...[start, middle, end].map((frame) => Math.abs(frame.bottom - before.bottom))),
        minimumClearance: Math.min(...topClearance),
      };
    });

    expect(frames.start).toBeCloseTo(frames.before, 0);
    expect(frames.middle).toBeGreaterThan(frames.start);
    expect(frames.middle).toBeLessThan(frames.end);
    expect(frames.bottomShift).toBeLessThan(1);
    expect(frames.minimumClearance).toBeGreaterThanOrEqual(0);
  });
}

const touchPhone = test.extend({ hasTouch: true, isMobile: true });

touchPhone('a repeated trial reveal tap cannot rate before the answer face appears', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/sets/philippine-history/try');
  const show = page.getByRole('button', { name: 'Show answer' });
  await expect(show).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const revealTap = await show.evaluate(async (button: HTMLButtonElement) => {
    const box = button.getBoundingClientRect();
    const card = document.querySelector<HTMLElement>('[data-card-frame]')!;
    const dock = document.querySelector<HTMLElement>('.review-dock')!;
    button.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const flipDuration = Number(card.getAnimations()[0].effect!.getTiming().duration);
    for (const element of [card, dock]) {
      for (const animation of element.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = flipDuration * 0.45;
      }
    }
    return { x: Math.round(box.left + box.width * 0.38), y: Math.round(box.top + box.height / 2) };
  });

  await expect(page.locator('.review-back')).toHaveCSS('opacity', '0');
  await page.touchscreen.tap(revealTap.x, revealTap.y);
  const position = page.locator('.review-front .review-side-label');
  await expect(position).toHaveText('Card 1 of 5');
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()));
  await page.getByRole('button', { name: /^Hard:/ }).tap();
  await expect(position).toHaveText('Card 2 of 5');
});

test('Solid controls in Help changes the trial dock and persists on reload', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/sets');
  await expect(page.getByRole('heading', { name: 'Reviewers', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Help', exact: true })).toHaveCount(0);
  await page.goto('/help');
  const solidControls = page.getByRole('checkbox', { name: 'Solid controls' });
  await expect(solidControls).toBeVisible();
  await expect(solidControls).not.toBeChecked();

  const trial = await page.context().newPage();
  await trial.setViewportSize({ width: 375, height: 667 });
  await trial.goto('/sets/philippine-history/try');
  const dock = trial.locator('.review-dock');
  await expect(dock).toHaveCSS('backdrop-filter', /^blur\(/);

  await solidControls.check();
  await page.reload();
  await expect(solidControls).toBeChecked();
  await expect(dock).toHaveCSS('backdrop-filter', 'none');
  await expect(dock).toHaveCSS('border-top-color', 'rgb(222, 226, 230)');
  await trial.getByRole('button', { name: 'Show answer' }).click();
  const ratings = trial.getByRole('group', { name: 'Rate your answer' });
  await expect(ratings).toBeVisible();
  for (const button of await ratings.getByRole('button').all()) {
    await expect(button).toHaveCSS('background-image', /^linear-gradient\(/);
  }
  await expect(dock).toHaveCSS('backdrop-filter', 'none');
  await expect(dock).toHaveCSS('border-top-color', 'rgb(222, 226, 230)');

  await solidControls.uncheck();
  await expect(dock).toHaveCSS('backdrop-filter', /^blur\(/);
  await trial.reload();
  await expect(dock).toHaveCSS('backdrop-filter', /^blur\(/);
});

test('increased contrast keeps glass on both trial card faces', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ contrast: 'more' });
  await page.goto('/sets/philippine-history/try');
  const dock = page.locator('.review-dock');
  await expect(dock).toHaveCSS('backdrop-filter', /^blur\(/);
  await expect(dock).toHaveCSS('border-top-color', 'rgb(222, 226, 230)');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('group', { name: 'Rate your answer' })).toBeVisible();
  await expect(dock).toHaveCSS('backdrop-filter', /^blur\(/);
  await expect(dock).toHaveCSS('border-top-color', 'rgb(222, 226, 230)');
});

test('compact account controls remain reachable at supported widths', async ({ page, pilot }) => {
  await page.goto(pilot.signupUrl);
  const username = `layout_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  const password = randomUUID();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
  const library = page.getByRole('link', { name: 'Library', exact: true });
  const help = page.getByRole('link', { name: 'Help', exact: true });
  const brand = page.getByRole('link', { name: 'Revue', exact: true });

  for (const [width, height, textSize] of [
    [390, 844, '100%'],
    [768, 1024, '100%'],
    [1366, 900, '100%'],
    [320, 568, '200%'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, textSize);
    await expectTouchTarget(signOut);
    await expectTouchTarget(library);
    await expect(help.getByText('Help', { exact: true })).toBeVisible();
    await expect(help.locator(':scope > svg')).toBeVisible();
    await expectTouchTarget(help);
    await expect(brand.locator(':scope > svg')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const [wordmark, helpLink] = await Promise.all([
      brand.getByText('Revue', { exact: true }).boundingBox(),
      help.boundingBox(),
    ]);
    expect(wordmark!.x + wordmark!.width <= helpLink!.x || wordmark!.y + wordmark!.height <= helpLink!.y).toBe(true);
    expect((await signOut.boundingBox())!.width).toBeLessThan(width * 0.65);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await expect(library).toHaveAttribute('href', '/library');
  await expect(page.getByRole('link', { name: 'Browse reviewers', exact: true })).toHaveCount(0);
  await expect(page.locator('a[href$="/try"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Try practice cards' })).toHaveCount(0);
  await help.press('Enter');
  await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
  await signOut.press('Enter');
  const prompt = page.getByRole('region', { name: 'Sign out of Revue?' });
  await expect(prompt.getByRole('button', { name: 'Stay signed in' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(signOut).toBeFocused();
  await signOut.click();
  await prompt.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('workspace navigation stays unique and reachable across layouts and enlarged text', async ({
  page,
  pilot,
}, info) => {
  await page.goto(pilot.signupUrl);
  await page.getByLabel('Username').fill(`workspace_${randomUUID().slice(0, 16)}`);
  const password = randomUUID();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);

  for (const [width, height, textSize] of [
    [390, 844, '100%'],
    [640, 900, '100%'],
    [768, 1024, '100%'],
    [1023, 900, '100%'],
    [1024, 768, '100%'],
    [1366, 900, '100%'],
    [320, 568, '200%'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, textSize);
    const tablet = width >= 640 && width < 1024;
    const tabletHeaderPositions: number[][] = [];
    const headingEdges: number[] = [];
    for (const [destination, title] of [
      ['Library', 'Library'],
      ['Browse', 'Reviewers'],
      ['Account', 'Your account'],
      ['Help', 'Help'],
      ['Today', 'Your review'],
    ]) {
      const link = page.getByRole('link', { name: destination, exact: true });
      await expect(link).toHaveCount(1);
      await expectTouchTarget(link);
      await link.focus();
      await page.keyboard.press('Enter');
      const heading = page.getByRole('heading', { name: title, exact: true });
      await expect(heading).toBeFocused();
      headingEdges.push((await heading.boundingBox())!.x);
      if (destination === 'Help' && width < 1024) await expect(link).toHaveCount(0);
      else await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('navigation', { name: 'Your workspace' })).toHaveCount(1);
      await expect(page.getByRole('link', { name: 'Browse reviewers', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

      if (destination === 'Help' && width === 390) {
        const back = page.getByRole('button', { name: 'Back', exact: true });
        const contentTop = await page.getByRole('main').evaluate((main) => {
          return main.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(main).paddingTop);
        });
        expect((await back.boundingBox())!.y).toBeCloseTo(contentTop);
        await expect(back).toHaveCSS('font-size', '16px');
        await expect(back).toHaveCSS('color', 'rgb(55, 48, 163)');
      }

      if (tablet) {
        const brand = page.getByRole('link', { name: 'Revue', exact: true });
        const navigation = page.getByRole('navigation', { name: 'Your workspace' });
        await expect(brand).toBeVisible();
        const boxes = await Promise.all([brand, navigation].map((element) => element.boundingBox()));
        expect(boxes[1]!.x).toBeCloseTo((await heading.boundingBox())!.x);
        const tabs = await navigation.getByRole('link').evaluateAll((links) =>
          links.map((tab) => {
            const { x, y, width, height } = tab.getBoundingClientRect();
            return [x, y, width, height];
          }),
        );
        expect(tabs).toHaveLength(4);
        for (const [, , tabWidth, tabHeight] of tabs) {
          expect(tabWidth).toBe(tabs[0][2]);
          expect(tabHeight).toBeGreaterThanOrEqual(48);
        }
        await expect
          .poll(() => navigation.evaluate((element) => getComputedStyle(element, '::before').opacity))
          .toBe(destination === 'Help' ? '0' : '1');
        tabletHeaderPositions.push([...boxes.flatMap((box) => [box!.x, box!.y]), ...tabs.flat()]);
      }

      if (destination === 'Help' && width >= 768 && textSize === '100%') {
        const [support, privacy, terms] = await Promise.all(
          ['Contact support', 'Privacy notice', 'Terms'].map((name) =>
            page.getByRole('link', { name, exact: true }).boundingBox(),
          ),
        );
        expect(support!.y).toBeCloseTo(terms!.y);
        expect(privacy!.x).toBeGreaterThan(support!.x);
        expect(terms!.x).toBeGreaterThan(privacy!.x);
      }

      if (destination === 'Account') {
        const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
        await signOut.scrollIntoViewIfNeeded();
        await expect(signOut).toBeInViewport({ ratio: 1 });
        if (width >= 768 && textSize === '100%') {
          const daily = page.getByRole('heading', { name: 'Daily new cards' });
          const choices = page.getByRole('group', { name: 'Daily new cards' });
          await expect(choices).toBeVisible();
          const [label, control] = await Promise.all([daily.boundingBox(), choices.boundingBox()]);
          expect(control!.x).toBeGreaterThanOrEqual(label!.x + label!.width);
          expect(control!.y).toBeLessThan(label!.y + label!.height);
        }
        if (width === 390) {
          const navigation = (await page.getByRole('navigation', { name: 'Your workspace' }).boundingBox())!;
          const action = (await signOut.boundingBox())!;
          expect(action.y + action.height).toBeLessThanOrEqual(navigation.y);
        }
      }
      await page.screenshot({ path: info.outputPath(`${destination.toLowerCase()}-${width}.png`), fullPage: true });
    }
    for (const edge of headingEdges) expect(edge).toBeCloseTo(headingEdges[0]);
    if (tablet) {
      expect(headingEdges[0]).toBeCloseTo(32);
      expect(tabletHeaderPositions).toHaveLength(5);
      for (const header of tabletHeaderPositions) expect(header).toEqual(tabletHeaderPositions[0]);
    }
  }
});

test('only Android phones get the larger workspace navigation inset', async ({ browser, pilot }, info) => {
  const devices = [
    ['Android phone', 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36', 20],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 8],
    ['Android tablet', 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', 8],
  ] as const;
  for (const [name, userAgent, inset] of devices) {
    const context = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'nav_learner' } }));
      await page.route('**/api/v1/public-sets/catalog/subjects', (route) =>
        route.fulfill({ json: [{ subject: 'Practical Math', topicCount: 3 }] }),
      );
      await page.goto(`${pilot.origin}/published`);
      await expect(page.getByRole('heading', { name: 'Reviewers' })).toBeVisible();
      const bar = page.getByRole('navigation', { name: 'Your workspace' });
      const side = inset === 20 ? 20 : 16;
      await expect(page.getByRole('main')).toHaveCSS('padding-left', `${side}px`);
      await expect(page.getByRole('main')).toHaveCSS('padding-right', `${side}px`);
      await expect(bar).toHaveCSS('bottom', `${inset}px`);
      await expect(bar).toHaveCSS('backdrop-filter', /^blur\(/);
      const bounds = (await bar.boundingBox())!;
      expect(844 - bounds.y - bounds.height).toBeCloseTo(inset, 0);
      await page.screenshot({ path: info.outputPath(`${name.toLowerCase().replace(' ', '-')}-nav.png`) });
      await page.setViewportSize({ width: 768, height: 844 });
      await expect(bar).not.toHaveCSS('bottom', `${inset}px`);
    } finally {
      await context.close();
    }
  }
});

test('Android phone page edges line up across public, study, and workspace screens', async ({ browser, pilot }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    const open = (path: string) => page.goto(`${pilot.origin}${path}`);
    const expectPageGutter = async () => {
      const content = page.locator('main.page-gutters, main > .page-gutters');
      await expect(content).toHaveCSS('padding-left', '20px');
      await expect(content).toHaveCSS('padding-right', '20px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
    };

    for (const path of [
      '/',
      '/how-it-works',
      '/sets',
      '/sets/philippine-history',
      '/sign-in',
      '/join',
      '/register',
      '/help',
      '/privacy',
      '/terms',
      '/missing-page',
    ]) {
      await open(path);
      await expectPageGutter();
    }

    await open('/sets/philippine-history');
    const studyDock = page.locator('.set-detail-study');
    await expect(studyDock).toHaveCSS('bottom', '20px');
    await open('/sets/philippine-history/try');
    await expectPageGutter();
    await page.getByRole('button', { name: 'Show answer' }).click();
    const ratings = page.locator('.review-dock-after-reveal');
    await expect(ratings).toBeInViewport({ ratio: 1 });
    await expect(ratings).toHaveCSS('padding', '10px');
    await expect(ratings.locator('.review-rating-grid')).toHaveCSS('gap', '6px');
    const bounds = (await ratings.boundingBox())!;
    expect(844 - bounds.y - bounds.height).toBeCloseTo(20, 0);
    await page.getByRole('button', { name: 'Card details' }).click();
    const dialog = page.getByRole('dialog', { name: 'Card details' });
    await expect(dialog).toHaveCSS('width', '350px');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await page.setViewportSize({ width: 639, height: 844 });
    const card = (await page.locator('.review-card-frame').boundingBox())!;
    expect(card.x).toBe(20);
    expect(card.width).toBe(599);
    expect((await ratings.boundingBox())!.x).toBe(20);
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(ratings).toBeInViewport({ ratio: 1 });
    await expect(ratings.getByRole('button')).toHaveCount(4);
    for (const button of await ratings.getByRole('button').all()) await expectTouchTarget(button);
    await expectWordOnOneLine(ratings.getByRole('button', { name: /^Missed:/ }), 'Missed');
    await page.setViewportSize({ width: 390, height: 844 });

    await open('/register');
    await page.getByLabel('Username').fill(`gutter_${randomUUID().slice(0, 16)}`);
    const password = randomUUID();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page).toHaveURL(/\/today$/);
    for (const path of ['/today', '/library', '/library/decks/new', '/published', '/account', '/help']) {
      await open(path);
      await expectPageGutter();
    }

    const subject = 'History';
    await page.route('**/api/v1/public-sets/catalog/subjects', (route) =>
      route.fulfill({ json: [{ subject, topicCount: 5 }] }),
    );
    await page.route('**/api/v1/public-sets?published=true*', (route) =>
      route.fulfill({
        json: Array.from({ length: 5 }, (_, index) => ({
          ...historySet,
          subject,
          setKey: `history-topic-${index}`,
          title: `History topic ${index + 1}`,
        })),
      }),
    );
    await page.setViewportSize({ width: 390, height: 480 });
    await open('/published?subject=History');
    await expect(page.getByRole('region', { name: 'Topics' })).toBeVisible();
    const help = page.getByRole('link', { name: 'Help', exact: true });
    await page.evaluate(() => window.scrollTo({ top: 250, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(20);
    expect((await help.boundingBox())!.y).toBeCloseTo(20, 0);

    await page.setViewportSize({ width: 320, height: 568 });
    await open('/library');
    await expectPageGutter();
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await expectPageGutter();
    await expect(page.getByRole('link', { name: 'Create a deck', exact: true })).toBeInViewport();
  } finally {
    await context.close();
  }
});

test('the floating phone navigation stays above the bottom edge while a long page scrolls', async ({ page, pilot }) => {
  const screen = { width: 390, height: 420 };
  await page.setViewportSize(screen);
  await page.goto(pilot.signupUrl);
  await page.getByLabel('Username').fill(`tabbar_${randomUUID().slice(0, 16)}`);
  const password = randomUUID();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
  await expect(signOut).toBeVisible();
  const bar = page.getByRole('navigation', { name: 'Your workspace' });
  await expect(page.locator('#root')).toHaveCSS('padding-block-start', '0px');
  await expect(page.locator('html')).toHaveCSS('overscroll-behavior-y', 'auto');
  await expect(bar.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
  await expect(bar.getByText('Account', { exact: true })).toHaveCSS('opacity', '1');
  await expect(bar.getByText('Library', { exact: true })).toHaveCSS('opacity', '0');
  await expectTouchTarget(bar.getByRole('link', { name: 'Library' }));
  expect((await bar.boundingBox())!.width).toBeLessThan(screen.width);
  const barBottom = async () => {
    const box = (await bar.boundingBox())!;
    return Math.round(box.y + box.height);
  };

  // Chrome before 129, Firefox before 133 and Safari before 18.4 also contain fixed descendants
  // of a query container. Layout containment reproduces that rule in the current browser.
  for (const olderContainment of [false, true]) {
    if (olderContainment) await page.addStyleTag({ content: '.workspace-container { contain: layout; }' });
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
    for (const edge of ['top', 'bottom'] as const) {
      await page.evaluate((target) => {
        window.scrollTo({ top: target === 'top' ? 0 : document.documentElement.scrollHeight, behavior: 'instant' });
      }, edge);
      expect(await barBottom()).toBe(screen.height - 8);
    }
    await signOut.scrollIntoViewIfNeeded();
    const action = (await signOut.boundingBox())!;
    expect(action.y + action.height).toBeLessThanOrEqual((await bar.boundingBox())!.y);
  }
});

test('long forms use document scrolling when the available keyboard viewport is short', async ({ page, pilot }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(pilot.signupUrl);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.getByLabel('Username').fill('form_' + randomUUID().slice(0, 12));
  await page.setViewportSize({ width: 320, height: 320 });
  const password = randomUUID();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password + 'x');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const error = page.getByRole('alert');
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport();
  expect(await page.getByRole('main').evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
});

test('a failed session request offers retry before showing the signed-in workspace', async ({ page, pilot }) => {
  await page.goto(pilot.signupUrl);
  await page.getByLabel('Username').fill('retry_' + randomUUID().slice(0, 12));
  const password = randomUUID();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.route('**/api/v1/me', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Check your connection and try again.');
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await page.unroute('**/api/v1/me');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
});

async function expectWordOnOneLine(heading: Locator, word: string) {
  const fragments = await heading.evaluate(async (element, text) => {
    await document.fonts.ready;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent?.indexOf(text) ?? -1;
      if (start === -1) continue;
      const range = new Range();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      return range.getClientRects().length;
    }
    return 0;
  }, word);
  expect.soft(fragments, `“${word}” fits on one line`).toBe(1);
}

async function expectTouchTarget(link: Locator) {
  await link.scrollIntoViewIfNeeded();
  const target = await link.evaluate((element) => {
    const { width, height, x, y } = element.getBoundingClientRect();
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const hits = (px: number, py: number) => element.contains(document.elementFromPoint(px, py));
    const edgesHit =
      hits(centerX - 23, centerY) &&
      hits(centerX + 23, centerY) &&
      hits(centerX, centerY - 23) &&
      hits(centerX, centerY + 23);
    return { width, height, edgesHit };
  });
  expect.soft(target.width).toBeGreaterThanOrEqual(48);
  expect.soft(target.height).toBeGreaterThanOrEqual(48);
  expect.soft(target.edgesHit).toBe(true);
}
