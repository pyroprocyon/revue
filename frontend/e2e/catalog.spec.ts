import { test, expect } from './fixtures';
import { historySet, natureSet } from '../src/test/fixtures';

test('catalog pages survive preview navigation, browser history and reloads', async ({ page }) => {
  await page.route('**/api/v1/public-sets**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/philippine-nature')) {
      await route.fulfill({ json: natureSet });
      return;
    }
    const secondPage = url.searchParams.has('after');
    await route.fulfill({
      json: [secondPage ? natureSet : historySet],
      headers: secondPage ? {} : { 'X-Next-Cursor': 'next-position' },
    });
  });
  await page.goto('/sets');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('link', { name: new RegExp(natureSet.title) }).click();
  await expect(page.getByRole('heading', { name: natureSet.title })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Practice sets' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(natureSet.title) })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: new RegExp(natureSet.title) })).toBeVisible();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByRole('link', { name: new RegExp(historySet.title) })).toBeVisible();
});
