import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { historyCards, historySet } from '../src/test/fixtures';
import { SIGNED_IN_HINT_KEY } from '../src/shared/navigation/signedInHint';

test('Today redirects after one account check and rechecks sign-in on reload', async ({ page, pilot }) => {
  const sessionReads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/me' || path === '/api/v1/auth/session') sessionReads.push(path);
  });

  await page.goto(`${pilot.origin}/today`);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(sessionReads).toEqual(['/api/v1/me']);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(sessionReads).toEqual(['/api/v1/me', '/api/v1/auth/session']);
});

test('a rejected private read opens sign-in even after a recent account check', async ({ page }) => {
  let profileRequests = 0;
  let publicSessionRequests = 0;
  let dueRequests = 0;
  await page.route('**/api/v1/me', (route) => {
    profileRequests++;
    return route.fulfill({ json: { username: 'session_learner' } });
  });
  await page.route('**/api/v1/auth/session', (route) => {
    publicSessionRequests++;
    return route.fulfill({ json: { signedIn: false } });
  });
  await page.route('**/api/v1/cards/due*', (route) => {
    dueRequests++;
    return route.fulfill({ status: dueRequests === 1 ? 401 : 503 });
  });

  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftoday$/);
  expect({ profileRequests, publicSessionRequests, dueRequests }).toEqual({
    profileRequests: 1,
    publicSessionRequests: 1,
    dueRequests: 1,
  });
});

test('review and Help reuse the current session until the freshness window closes', async ({ page }) => {
  const checks: string[] = [];
  await page.route('**/api/v1/me', (route) => {
    checks.push('account');
    return route.fulfill({ json: { username: 'session_learner' } });
  });
  await page.route('**/api/v1/auth/session', (route) => {
    checks.push('public session');
    return route.fulfill({ json: { signedIn: true } });
  });
  await page.route('**/api/v1/cards/due*', (route) =>
    route.fulfill({
      json: {
        totalCards: 1,
        availableCards: 1,
        dueCards: 1,
        newCards: 0,
        nextReviewDate: null,
        topics: [{ id: 'set-1', title: 'History', dueCards: 1 }],
        cards: [{ ...historyCards.cards[0], id: '23', setTitle: 'History', contentVersion: 1, version: 0 }],
      },
    }),
  );
  await page.goto('/today');
  await page.getByRole('link', { name: 'Review 1 card', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeEnabled();
  await page.getByRole('link', { name: 'Finish for now' }).click();
  await expect(page.getByRole('heading', { name: 'Your review', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Review 1 card', exact: true })).toBeEnabled();
  expect(checks).toEqual(['account']);

  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date((await page.evaluate(() => Date.now())) + 30_000));
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect.poll(() => checks).toEqual(['account', 'account']);
});

async function delaySession(page: Page, signedIn = true) {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/session') {
      await pending;
      return route.fulfill({ json: { signedIn } });
    }
    if (path.endsWith('/demo-cards')) return route.fulfill({ json: historyCards });
    return route.fulfill({ status: 404 });
  });
  return release;
}

for (const width of [375, 1366]) {
  for (const signedIn of [true, false]) {
    test(`blocked storage waits on repeated home visits at ${width}px (signed in: ${signedIn})`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Storage blocked', 'SecurityError');
          },
        });
        new MutationObserver(() => {
          if (document.querySelector('.landing-hero')) document.documentElement.dataset.landingSeen = 'true';
        }).observe(document, { childList: true, subtree: true });
      });
      for (let visit = 1; visit <= 2; visit++) {
        const release = await delaySession(page, signedIn);
        await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'storage_learner' } }));
        await page.route('**/api/v1/cards/due*', (route) =>
          route.fulfill({
            json: {
              totalCards: 0,
              availableCards: 0,
              dueCards: 0,
              newCards: 0,
              nextReviewDate: null,
              cards: [],
            },
          }),
        );
        try {
          await page.goto('/');
          await expect(page.getByRole('status')).toHaveText('Checking your session…');
          await expect(page.getByRole('heading', { name: 'Review before it’s due.' })).toHaveCount(0);
          await expect(page.locator('html')).not.toHaveAttribute('data-landing-seen');
          release();
          await expect(
            page.getByRole('heading', {
              name: signedIn ? 'Your review' : 'Review before it’s due.',
              exact: true,
            }),
          ).toBeVisible();
          if (signedIn) await expect(page.locator('html')).not.toHaveAttribute('data-landing-seen');
          if (visit === 2)
            await page.screenshot({ path: info.outputPath('blocked-storage-ready.png'), fullPage: true });
        } finally {
          release();
        }
      }
    });
  }
}

test('a guest sees the homepage at once while the session check is still pending', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const release = await delaySession(page, false);
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Review before it’s due.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse reviewers' }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Create account' }).filter({ visible: true })).toHaveCount(0);
    const sample = page.getByRole('figure', { name: 'Sample card' });
    const pendingBox = await sample.boundingBox();
    await page.screenshot({ path: info.outputPath('guest-home-pending.png'), fullPage: true });
    release();
    await expect(page.getByRole('link', { name: 'Sign in' }).filter({ visible: true })).toHaveCount(1);
    // The account links had their space reserved, so the page does not shift when they appear.
    expect(await sample.boundingBox()).toEqual(pendingBox);
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('guest-home-ready.png'), fullPage: true });
  } finally {
    release();
  }
});

test('a remembered session can open reviewers from Home while the session check is pending', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((key) => localStorage.setItem(key, 'true'), SIGNED_IN_HINT_KEY);
  const release = await delaySession(page, false);
  await page.route('**/api/v1/public-sets/catalog/onboarding', (route) => route.fulfill({ json: [historySet] }));
  try {
    await page.goto('/');
    const browse = page.getByRole('link', { name: 'Browse reviewers' });
    const initialPosition = await browse.boundingBox();
    await expect(page.getByText('Checking your session…')).toBeVisible();
    expect(await browse.boundingBox()).toEqual(initialPosition);
    await browse.click();
    await expect(page).toHaveURL(/\/sets$/);
    await expect(page.getByRole('link', { name: /Philippine History/ })).toBeVisible();
  } finally {
    release();
  }
});

test('a guest can type sign-in details while the session check is pending', async ({ page }) => {
  const release = await delaySession(page, false);
  const username = page.getByLabel('Username');
  const password = page.getByLabel('Password', { exact: true });
  const typedPassword = crypto.randomUUID();
  try {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await username.fill('testlearner');
    await password.fill(typedPassword);
    await expect(page.getByRole('button', { name: 'Checking your session…' })).toBeDisabled();
    release();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await expect(username).toHaveValue('testlearner');
    await expect(password).toHaveValue(typedPassword);
  } finally {
    release();
  }
});

test('direct Help controls work while the session check is pending', async ({ page }) => {
  const release = await delaySession(page, false);
  try {
    await page.goto('/help');
    await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
    const solidControls = page.getByRole('switch', { name: 'Solid controls' });
    await solidControls.press('Space');
    await expect(solidControls).toBeChecked();
    await expect(page.getByRole('link', { name: 'Privacy notice' })).toBeVisible();
  } finally {
    release();
  }
});

for (const control of ['Solid controls', 'Terms', 'Revue', 'Skip to content'] as const) {
  test(`direct Help keeps focus on ${control} after sign-in confirmation`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const release = await delaySession(page, true);
    try {
      await page.goto('/help');
      const target = page.getByRole(control === 'Solid controls' ? 'switch' : 'link', { name: control, exact: true });
      await target.focus();
      if (control === 'Solid controls') await target.press('Space');
      await expect(target).toBeFocused();
      release();
      await expect(page.getByRole('navigation', { name: 'Your workspace' })).toBeVisible();
      await expect(target).toBeFocused();
      if (control === 'Solid controls') await expect(target).toBeChecked();
    } finally {
      release();
    }
  });
}

test('an old desktop guide link scrolls after the session check reveals the landing page', async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  // A guest in a browser that was signed in before: the homepage waits, so the guide mounts late.
  await page.addInitScript((key) => localStorage.setItem(key, 'true'), SIGNED_IN_HINT_KEY);
  const release = await delaySession(page, false);
  try {
    await page.goto('/#how-it-works');
    await expect(page.getByRole('status')).toHaveText('Checking your session…');
    release();
    const guide = page.getByRole('heading', { name: 'How spaced repetition works' });
    await expect(guide).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath('deferred-guide-section.png'), fullPage: true });
  } finally {
    release();
  }
});

for (const { width, enlarged } of [
  { width: 375, enlarged: false },
  { width: 1366, enlarged: false },
  { width: 320, enlarged: true },
]) {
  test(`not-found navigation waits for the account at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const release = await delaySession(page);
    try {
      await page.goto('/missing-page');
      if (enlarged) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeFocused();
      await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Go to Today' })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('not-found-pending.png'), fullPage: true });
      release();
      const action = page.getByRole('link', { name: 'Go to Today' });
      await expect(action).toHaveAttribute('href', '/today');
      await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveCount(0);
      await action.focus();
      await expect(action).toBeFocused();
      await page.screenshot({ path: info.outputPath('not-found-ready.png'), fullPage: true });
    } finally {
      release();
    }
  });

  test(`trial completion avoids guest emphasis during an account check at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const release = await delaySession(page);
    try {
      await page.goto('/sets/philippine-history/try');
      if (enlarged) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      for (let card = 0; card < 5; card++) {
        await page.getByRole('button', { name: 'Show answer' }).click();
        await page.getByRole('button', { name: /^Good:/ }).click();
      }
      const heading = page.getByRole('heading', { name: 'You practiced 5 cards.' });
      await expect(heading).toBeFocused();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const another = page.getByRole('link', { name: 'Browse reviewers' });
      const back = page.getByRole('link', { name: 'View topic details' });
      await expect(another).toHaveClass(/bg-surface/);
      await expect(back).toHaveClass(/bg-surface/);
      await page.screenshot({ path: info.outputPath('trial-completion-pending.png'), fullPage: true });
      release();
      await expect(back).toHaveClass(/bg-accent /);
      await expect(another).toHaveClass(/bg-surface/);
      await expect(heading).toBeFocused();
      await page.screenshot({ path: info.outputPath('trial-completion-ready.png'), fullPage: true });
    } finally {
      release();
    }
  });
}
