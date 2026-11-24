import { test, expect } from './fixtures';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { username: 'focus_learner' } }));
});

test('reviewer search keeps touch focus and restores the keyboard ring', async ({ page }) => {
  await page.route('**/api/v1/public-sets/catalog/subjects', (route) =>
    route.fulfill({ json: [{ subject: 'Biology', topicCount: 1 }] }),
  );
  await page.route('**/api/v1/me/saved-sets/keys', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v1/public-sets?published=true&limit=100&subject=Biology*', (route) =>
    route.fulfill({
      json: [
        {
          setKey: 'cell-biology-basics',
          title: 'Cell Biology Basics',
          description: 'Practice six cards',
          subject: 'Biology',
          publisherName: 'Revue',
          cardCount: 6,
          trialAvailable: true,
          saveAllowed: true,
        },
      ],
    }),
  );
  await page.goto('/published');
  const subject = page.getByRole('link', { name: 'Open Biology' });
  const field = page.getByRole('searchbox', { name: 'Search subjects' });
  await field.tap();
  await expect(field).toBeFocused();
  await field.fill('bio');
  await expect(field).toHaveValue('bio');
  await page.keyboard.press('End');
  await page.keyboard.press('Space');
  await expect(field).toHaveValue('bio ');
  await expect(field).toHaveCSS('outline-style', 'none');
  await expect(field).toHaveCSS('border-color', 'rgb(55, 48, 163)');

  await page.getByRole('button', { name: 'Clear subject search' }).tap();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  await expect(field).toHaveCSS('outline-style', 'none');

  await page.keyboard.press('Tab');
  await expect(subject).toBeFocused();
  await expect(subject).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Biology', level: 1 })).toBeFocused();
  const topicSearch = page.getByRole('searchbox', { name: 'Search topics' });
  await topicSearch.tap();
  await topicSearch.fill('cell');
  await expect(topicSearch).toBeFocused();
  await page.getByRole('button', { name: 'Clear topic search' }).tap();
  await expect(topicSearch).toBeFocused();
  await page.getByRole('link', { name: 'Reviewers', exact: true }).click();
  await expect(subject).toBeFocused();
});

test('daily limit choices show a ring for keyboard selection and use the selected style on touch', async ({ page }) => {
  await page.route('**/api/v1/me/study-settings', (route) => route.fulfill({ json: { dailyNewCardLimit: 10 } }));
  await page.goto('/account');
  const limit = page.getByRole('radio', { name: '20 per day' });
  const label = limit.locator('..');
  await label.tap();
  await expect(limit).toBeChecked();
  await expect(label).toHaveCSS('outline-style', 'none');

  await limit.focus();
  await page.keyboard.press('ArrowLeft');
  const previous = page.getByRole('radio', { name: '10 per day' });
  await expect(previous).toBeFocused();
  await expect(previous).toBeChecked();
  await expect(previous.locator('..')).toHaveCSS('outline-style', 'solid');
});
