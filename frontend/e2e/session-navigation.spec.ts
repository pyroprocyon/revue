import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { historyCards } from '../src/test/fixtures';
import { SIGNED_IN_HINT_KEY } from '../src/shared/navigation/signedInHint';

async function delaySession(page: Page, signedIn = true) {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
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

test('a guest sees the homepage at once while the session check is still pending', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const release = await delaySession(page, false);
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Review before it’s due.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse sets' }).filter({ visible: true })).toHaveCount(1);
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
        await page.getByRole('button', { name: 'Check answer' }).click();
        await page.getByRole('button', { name: /^Good:/ }).click();
      }
      const heading = page.getByRole('heading', { name: 'You practiced 5 cards.' });
      await expect(heading).toBeFocused();
      const another = page.getByRole('link', { name: 'Try another set' });
      const back = page.getByRole('link', { name: 'Back to the set' });
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
