import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const setupName = 'Install Revue';
const android = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';

async function offerInstall(page: Page, outcome: 'accepted' | 'dismissed' | 'failed') {
  return page.evaluate((result) => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        const root = document.documentElement;
        root.dataset.promptCalls = String(Number(root.dataset.promptCalls ?? 0) + 1);
        if (result === 'failed') throw new Error('Installer unavailable');
      },
      userChoice: Promise.resolve({ outcome: result }),
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }, outcome);
}

test('launcher metadata and icons are public and a signed-out launch preserves Today', async ({ page, request }) => {
  await page.goto('/help');
  const manifestPath = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(manifestPath).toBe('/manifest.json');
  const response = await request.get(manifestPath!);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/application\/(manifest\+json|json)/);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: 'Revue', id: '/', start_url: '/today', scope: '/', display: 'standalone' });
  expect(manifest.icons).toEqual([
    expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
  ]);
  const touchIcon = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
  for (const { src, sizes } of [...manifest.icons, { src: touchIcon, sizes: '180x180' }]) {
    const image = await request.get(src);
    expect(image.headers()['content-type']).toContain('image/png');
    const png = await image.body();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)].join('x')).toBe(sizes);
  }
  await page.goto(manifest.start_url);
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftoday$/);
});

test('a fresh Home Screen launch reaches Today with only the session cookies', async ({ page, browser, pilot }) => {
  const password = randomUUID();
  await page.goto(pilot.signupUrl);
  await page.getByRole('textbox', { name: 'Username' }).fill('home_' + randomUUID().slice(0, 16));
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/today$/);
  const app = await browser.newContext({ baseURL: pilot.origin });
  try {
    await app.addCookies(await page.context().cookies());
    const launch = await app.newPage();
    await launch.goto('/today');
    await expect(launch.getByRole('heading', { name: 'Your review' })).toBeVisible();
    await app.clearCookies();
    await launch.reload();
    await expect(launch).toHaveURL(/\/sign-in\?returnTo=%2Ftoday$/);
  } finally {
    await app.close();
  }
});

test.describe('Android Home screen', () => {
  test.use({ userAgent: android });
  test('a prompt received before Help opens takes one tap, and dismissal falls back to the menu', async ({ page }) => {
    await page.goto('/help');
    await page.getByRole('link', { name: 'Privacy notice' }).click();
    expect(await offerInstall(page, 'dismissed')).toBe(true);
    await page.goBack();
    await page.getByRole('button', { name: setupName }).click();
    await expect(page.locator('html')).toHaveAttribute('data-prompt-calls', '1');
    await page.getByRole('button', { name: setupName }).click();
    await expect(page.getByText('Install and create shortcut', { exact: true })).toBeVisible();
    expect(await offerInstall(page, 'failed')).toBe(true);
    await page.getByRole('button', { name: setupName }).click();
    await expect(page.getByRole('status')).toContainText('use the browser menu');
    expect(await offerInstall(page, 'accepted')).toBe(true);
    await page.getByRole('button', { name: setupName }).click();
    await expect(page.locator('html')).toHaveAttribute('data-prompt-calls', '3');
    await expect(page.getByRole('button', { name: setupName })).toHaveCount(0);
  });
});

test.describe('iPhone Home Screen', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15' });
  test('one tap reveals the Safari steps and a standalone launch hides setup', async ({ page }) => {
    await page.goto('/help');
    await page.getByRole('button', { name: setupName }).click();
    await expect(page.getByText('Open as Web App', { exact: true })).toBeVisible();
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await page.reload();
    await expect(page.getByRole('link', { name: 'Privacy notice' })).toBeVisible();
    await expect(page.getByRole('button', { name: setupName })).toHaveCount(0);
  });
});
