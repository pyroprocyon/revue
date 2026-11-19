import { test, expect } from './fixtures';

test('the trial revalidates prefetched cards without downloading the same body twice', async ({ page, pilot }) => {
  const network = await page.context().newCDPSession(page);
  await network.send('Network.enable');
  const trials = new Set<string>();
  const statuses: { id: string; status: number }[] = [];
  network.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (request.url.endsWith('/demo-cards')) trials.add(requestId);
  });
  network.on('Network.responseReceivedExtraInfo', ({ requestId, statusCode }) => {
    statuses.push({ id: requestId, status: statusCode });
  });
  await page.goto(`${pilot.origin}/sets/philippine-history`);
  await expect
    .poll(() => statuses.filter((response) => trials.has(response.id)).map((response) => response.status))
    .toEqual([200]);
  await page.getByRole('link', { name: 'Try 5 cards', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeVisible();
  await expect
    .poll(() => statuses.filter((response) => trials.has(response.id)).map((response) => response.status))
    .toEqual([200, 304]);
});

test('typing prepares one form token and signup rotates it before deck creation', async ({ page, pilot }) => {
  const tokenPath = '/api/v1/auth/csrf';
  let requests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === tokenPath) requests++;
  });
  await page.goto(pilot.invitation());
  const username = page.getByLabel('Username', { exact: true });
  await username.focus();
  expect(requests).toBe(0);
  await username.fill('form_' + crypto.randomUUID().slice(0, 12));
  await expect.poll(() => requests).toBe(1);
  const password = crypto.randomUUID();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('link', { name: 'Create a deck' }).click();
  const name = page.getByLabel('Name', { exact: true });
  await name.focus();
  expect(requests).toBe(1);
  await page.route('**' + tokenPath, (route) => route.fulfill({ status: 503 }), { times: 1 });
  const failedPreparation = page.waitForResponse((response) => new URL(response.url()).pathname === tokenPath);
  await name.fill('First draft');
  expect((await failedPreparation).status()).toBe(503);
  await name.fill('Exam prep');
  expect(requests).toBe(2);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New card' })).toBeVisible();
  expect(requests).toBe(3);
});
