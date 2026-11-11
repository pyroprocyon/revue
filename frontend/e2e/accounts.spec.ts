import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';

// Synthetic credentials exist only in the disposable test database.
const PASSWORD = 'kanjii';
const username = () => `learner_${randomUUID().replaceAll('-', '').slice(0, 24)}`;

async function register(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Username' }).fill(name);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD);
  const response = page.waitForResponse(result => result.url().endsWith('/api/v1/auth/register') && result.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create account' }).click();
  return response;
}

async function signIn(page: Page, name: string, password = PASSWORD) {
  await page.getByRole('textbox', { name: 'Username' }).fill(name);
  await page.getByLabel(/^Password/).fill(password);
  const response = page.waitForResponse(result => result.url().endsWith('/api/v1/auth/login') && result.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign in' }).click();
  return response;
}

test('invited learner registers with six characters, reloads, signs out and signs back in', async ({ page, context, pilot }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Review before it’s due.' })).toBeVisible();
  expect(await context.cookies()).toHaveLength(0);
  await page.goto(pilot.invitation().replace('/register#invite=', '/i#'));
  await expect(page).not.toHaveURL(/#/);
  await expect(page.getByRole('textbox', { name: /email/i })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /privacy/i })).toHaveCount(0);
  const notice = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Terms (opens in a new tab)' }).click();
  const terms = await notice;
  await expect(terms.getByRole('heading', { name: 'Terms', exact: true })).toBeVisible();
  await terms.close();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeEnabled();

  const name = username();
  await register(page, name);
  await expect(page.getByRole('heading', { name: `You’re signed in, ${name}` })).toBeVisible();
  const firstSession = (await context.cookies()).find(cookie => cookie.name === 'SESSION');
  expect(firstSession?.httpOnly).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: `You’re signed in, ${name}` })).toBeVisible();
  const me = await page.request.get('/api/v1/me');
  expect(await me.json()).toEqual({ username: name });
  expect(me.headers()['cache-control']).toContain('no-store');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole('textbox', { name: 'Username' }).fill(name);
  const password = page.getByLabel('Password', { exact: true });
  await password.fill(PASSWORD);
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  const loginResponse = page.waitForResponse(result => result.url().endsWith('/api/v1/auth/login') && result.request().method() === 'POST');
  await password.press('Enter');
  expect((await loginResponse).status()).toBe(200);
  await expect(page.getByRole('heading', { name: `You’re signed in, ${name}` })).toBeVisible();
  expect((await context.cookies()).find(cookie => cookie.name === 'SESSION')?.value).not.toBe(firstSession?.value);
});

test('wrong and unknown credentials give the same error and a learner can retry', async ({ page, pilot }) => {
  const name = username();
  await page.goto(pilot.invitation());
  await register(page, name);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await signIn(page, name, 'wrongpass')).status()).toBe(401);
  await expect(page.getByRole('alert')).toHaveText('Username or password is incorrect');
  await expect(page.getByLabel(/^Password/)).toHaveValue('');
  expect((await signIn(page, username(), 'wrongpass')).status()).toBe(401);
  await expect(page.getByRole('alert')).toHaveText('Username or password is incorrect');
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await signIn(page, name);
  await expect(page.getByRole('heading', { name: `You’re signed in, ${name}` })).toBeVisible();
});

test('existing learners keep their shared-set destination when switching to sign-in', async ({ page, pilot }) => {
  const name = username();
  await page.goto(pilot.invitation());
  await register(page, name);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  const invitation = new URL(pilot.invitation());
  invitation.searchParams.set('returnTo', '/sets/philippine-history');
  await page.goto(invitation.href);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await signIn(page, name);
  await expect(page).toHaveURL(/\/sets\/philippine-history$/);
  await expect(page.getByRole('heading', { name: 'Philippine History', exact: true })).toBeVisible();
});

test('two browsers keep separate accounts and a duplicate username leaves its invite usable', async ({ page, browser, pilot }) => {
  const first = username();
  const firstInvite = pilot.invitation();
  await page.goto(firstInvite);
  await register(page, first);
  await expect(page.getByRole('heading', { name: `You’re signed in, ${first}` })).toBeVisible();
  const otherContext = await browser.newContext({ baseURL: pilot.origin });
  try {
    const other = await otherContext.newPage();
    await other.goto(pilot.invitation());
    await register(other, first);
    await expect(other.getByRole('alert')).toContainText('That username is unavailable');
    expect((await other.request.get('/api/v1/me')).status()).toBe(401);
    const second = username();
    await register(other, second);
    await expect(other.getByRole('heading', { name: `You’re signed in, ${second}` })).toBeVisible();
    expect(await (await page.request.get('/api/v1/me')).json()).toEqual({ username: first });
    expect(await (await other.request.get('/api/v1/me')).json()).toEqual({ username: second });
    await other.getByRole('button', { name: 'Sign out' }).click();
    await expect(other).toHaveURL(/\/sign-in$/);
    expect((await page.request.get('/api/v1/me')).status()).toBe(200);
    await other.goto(firstInvite);
    await register(other, username());
    await expect(other.getByRole('alert')).toContainText('Use a valid invitation link');
    expect((await other.request.get('/api/v1/me')).status()).toBe(401);
  } finally { await otherContext.close(); }
});

test('public account and policy pages keep one contact route without account cookies', async ({ page, context }) => {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Help and policies' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    for (const route of ['/sign-in', '/register', '/privacy', '/terms']) {
      await page.goto(route);
      const support = route === '/privacy'
        ? page.getByRole('link', { name: 'Contact us', exact: true })
        : page.locator('a[href="mailto:revuetayo@gmail.com"]');
      await expect(support).toHaveCount(1);
      await expect(support).toHaveAttribute('href', route === '/privacy' ? '/terms#help-and-corrections' : 'mailto:revuetayo@gmail.com');
      await expect(support).toBeVisible();
      const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
      expect(size.content).toBeLessThanOrEqual(size.width);
      if (route === '/privacy') {
        await support.click();
        await expect(page).toHaveURL(/\/terms#help-and-corrections$/);
        await expect(page.locator('#help-and-corrections')).toBeInViewport();
      }
      if (route === '/privacy' || route === '/terms') {
        await page.getByRole('link', { name: 'Back to sign in', exact: true }).click();
        await expect(page).toHaveURL(/\/sign-in$/);
        await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
      }
    }
  }
  expect(await context.cookies()).toHaveLength(0);
});


test('privacy details and contact remain reachable with a keyboard and enlarged text', async ({ page }) => {
  await page.goto('/privacy');
  const details = page.locator('details');
  await expect(details).not.toHaveAttribute('open');
  await page.getByText('More privacy details', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  const content = page.getByRole('main');
  expect(await content.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.getByRole('link', { name: 'Revue', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(content).toBeFocused();
  const before = await content.evaluate(element => element.scrollTop);
  await page.keyboard.press('PageDown');
  await expect.poll(() => content.evaluate(element => element.scrollTop)).toBeGreaterThan(before);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.getByRole('link', { name: 'Contact us', exact: true }).click();
  await expect(page).toHaveURL(/\/terms#help-and-corrections$/);
  await expect(page.locator('#help-and-corrections')).toBeInViewport();
});


test('an invitation opened on an already-mounted registration page enables signup without reload', async ({ page, pilot }) => {
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();
  const name = username();
  await page.getByRole('textbox', { name: 'Username' }).fill(name);
  await page.goto(pilot.invitation());
  await expect(page.getByRole('button', { name: 'Create account' })).toBeEnabled();
  await expect(page).not.toHaveURL(/#invite=/);
  await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue(name);
  await register(page, name);
  await expect(page.getByRole('heading', { name: `You’re signed in, ${name}` })).toBeVisible();
});

test('first sign-in while offline gives guidance and recovers after reconnecting', async ({ page, context, pilot }) => {
  const name = username();
  await page.goto(pilot.invitation());
  await register(page, name);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.reload();
  await page.getByRole('textbox', { name: 'Username' }).fill(name);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await context.setOffline(true);
  try {
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Check your connection');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await expect(page.getByLabel(/^Password/)).toHaveValue('');
  } finally { await context.setOffline(false); }
  await signIn(page, name);
  await expect(page.getByRole('heading', { name: `You’re signed in, ${name}` })).toBeVisible();
});


test('the same short pilot link registers two independent learners', async ({ page, browser, pilot }) => {
  const invitation = pilot.invitation(true);
  const second = await browser.newContext({ baseURL: pilot.origin, viewport: { width: 390, height: 844 } });
  try {
    const other = await second.newPage();
    for (const learner of [page, other]) {
      const name = username();
      await learner.goto(invitation);
      await expect(learner).toHaveURL(/\/i$/);
      expect((await learner.request.get('/api/v1/me')).status()).toBe(401);
      expect((await register(learner, name)).status()).toBe(200);
      await expect(learner.getByRole('heading', { name: `You’re signed in, ${name}` })).toBeVisible();
      expect(await (await learner.request.get('/api/v1/me')).json()).toEqual({ username: name });
    }
  } finally {
    await second.close();
  }
});

test('a short public share opens the intended set and its trial without signing in', async ({ page, pilot }) => {
  const response = await page.request.get(`${pilot.origin}/api/v1/public-sets`);
  const sets: { setKey: string; shareCode: string; title: string }[] = await response.json();
  const set = sets.find(item => item.setKey === 'philippine-history');
  expect(set).toBeDefined();
  if (!set) throw new Error('The starter history set is required');
  await page.goto(`${pilot.origin}/s/${set.shareCode}`);
  await expect(page.getByRole('heading', { name: set.title, exact: true })).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await page.getByRole('link', { name: /Try 5 cards/ }).click();
  await expect(page).toHaveURL(/\/sets\/philippine-history\/try$/);
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeVisible();
});


test('signup checks the confirmation locally and sends only one password after correction', async ({ page, pilot }) => {
  const name = username();
  await page.goto(pilot.invitation());
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/v1/auth/register') && request.method() === 'POST') requests.push(request.postData() ?? '');
  });
  await page.getByLabel('Username', { exact: true }).fill(name);
  const password = page.getByLabel('Password', { exact: true });
  const confirmation = page.getByLabel('Confirm password', { exact: true });
  await password.fill(PASSWORD);
  await confirmation.fill(PASSWORD + 'x');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords don’t match.');
  expect(requests).toHaveLength(0);
  await expect(password).toHaveValue(PASSWORD);
  await confirmation.fill(PASSWORD);
  await page.getByRole('button', { name: 'Show confirmation password' }).click();
  await expect(confirmation).toHaveAttribute('type', 'text');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Hide confirmation password' }).click();
  const response = page.waitForResponse(result => result.url().endsWith('/api/v1/auth/register') && result.request().method() === 'POST');
  await confirmation.press('Enter');
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('heading', { name: `You’re signed in, ${name}` })).toBeVisible();
  expect(requests).toHaveLength(1);
  const sent = new URLSearchParams(requests[0]);
  expect([...sent.keys()].sort()).toEqual(['invitation', 'password', 'username']);
  expect(sent.get('password')).toBe(PASSWORD);
});
