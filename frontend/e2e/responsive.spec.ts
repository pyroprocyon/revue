import type { Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';

test('practice preview pairs the trial with the sample on tablet and docks it on phones', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: async () => {} });
  });
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('/sets/philippine-history');
  const trial = page.getByRole('link', { name: 'Try 5 cards' });
  const description = page.getByText(/from Mactan to Malolos/);
  const sample = page.getByRole('heading', { name: 'Sample question' });
  const share = page.getByRole('button', { name: 'Share', exact: true });
  const copy = page.getByRole('button', { name: 'Copy link' });
  await expect(trial).toHaveAccessibleDescription('Trial progress and ratings aren’t saved.');
  await expect(page.getByRole('link', { name: 'Sign in to save' })).toHaveCount(0);
  await expect(sample).toBeVisible();
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
  const sourceButton = page.getByRole('button', { name: 'Source' });
  await expectTouchTarget(sourceButton);
  await sourceButton.click();
  const source = page.getByRole('dialog', { name: 'Source' }).getByRole('link', { name: 'NHCP historical marker' });
  await expectTouchTarget(source);
  await expect(source).toBeInViewport({ ratio: 1 });
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
    await expect(page.getByRole('button', { name: 'Source' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByText('Card details', { exact: true })).toBeFocused();
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
    expect((await signOut.boundingBox())!.width).toBeLessThan(width * 0.65);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await expect(library).toHaveAttribute('href', '/library');
  await expect(page.getByRole('link', { name: 'Browse reviewers', exact: true })).toHaveCount(0);
  await expect(page.locator('a[href$="/try"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Try practice cards' })).toHaveCount(0);
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
      expect(tabletHeaderPositions).toHaveLength(5);
      for (const header of tabletHeaderPositions) expect(header).toEqual(tabletHeaderPositions[0]);
    }
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
