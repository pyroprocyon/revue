import { test, expect } from './fixtures';

test('tablet preview actions follow the content instead of sitting at the bottom of the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/sets/philippine-history');
  const article = page.getByRole('article');
  const start = page.getByRole('link', { name: 'Try 5 cards' });
  await expect(start).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const content = await article.boundingBox();
  const action = await start.boundingBox();
  expect(content).not.toBeNull();
  expect(action).not.toBeNull();
  expect(action!.y).toBeGreaterThanOrEqual(content!.y + content!.height);
  expect(action!.y - content!.y - content!.height).toBeLessThanOrEqual(64);
});

test('tablet trial keeps recall and rating controls within a compact card', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/sets/philippine-history/try');
  const check = page.getByRole('button', { name: 'Check answer', exact: true });
  await expect(check).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect((await check.boundingBox())!.y).toBeLessThan(700);
  await check.click();
  for (const rating of ['Missed', 'Hard', 'Good', 'Easy']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${rating}:`) })).toBeInViewport({ ratio: 1 });
  }
});
