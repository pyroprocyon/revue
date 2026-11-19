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
