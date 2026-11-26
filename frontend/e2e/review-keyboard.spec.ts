import { test, expect } from './fixtures';

test('keyboard focus during a rating dock resize keeps the first rating fully in view', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/*.woff2', (route) => route.abort());
  await page.goto('/sets/philippine-history/try');
  const show = page.getByRole('button', { name: 'Show answer', exact: true });
  await expect(show).toBeVisible();
  await page.evaluate(async () => {
    document.documentElement.style.fontSize = '200%';
    await document.fonts.ready;
  });
  const dock = page.locator('.review-dock');
  await dock.evaluate((element) => {
    const observer = new MutationObserver(() => {
      const resize = element.getAnimations()[0];
      if (!resize) return;
      // Keep the transition active across Playwright's separate keyboard calls.
      resize.playbackRate = 0.01;
      observer.disconnect();
    });
    observer.observe(element, { attributeFilter: ['class'] });
  });
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Lapulapu, the chief of Mactan' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Card details' })).toBeFocused();
  expect(await dock.evaluate((element) => element.getAnimations()[0]?.playbackRate)).toBe(0.01);
  await page.keyboard.press('Tab');
  const missed = page.getByRole('button', { name: /^Missed:/ });
  await expect(missed).toBeFocused();
  await expect(missed).toBeInViewport({ ratio: 0.995 });
});
