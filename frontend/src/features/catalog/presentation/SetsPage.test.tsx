import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { historySet, natureSet } from '../../../test/fixtures';
import { jsonResponse, renderApp, stubFetch } from '../../../test/renderApp';

const ONBOARDING = '/api/v1/public-sets/catalog/onboarding';

function stubCatalog(answer: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => (path === ONBOARDING ? answer() : jsonResponse(200, { signedIn: false }))),
  );
}

describe('Set list', () => {
  it('lists the onboarding reviewers without pagination even on an older bookmarked page', async () => {
    const weather = { ...historySet, setKey: 'weather-and-disasters', title: 'Weather & Disasters' };
    stubCatalog(() => jsonResponse(200, [historySet, natureSet, weather]));
    renderApp('/sets?after=old-cursor');

    expect(await screen.findByRole('heading', { level: 1, name: 'Reviewers' })).toBeDefined();
    expect(screen.getByText('Try a five-card practice session.')).toBeDefined();
    await screen.findByText(historySet.title);
    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/sets/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/sets/philippine-history',
      '/sets/philippine-nature',
      '/sets/weather-and-disasters',
    ]);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(links[0].textContent).toContain('Five moments from Mactan to Malolos.');
  });

  it('loads the list after a busy catalog answer without a click', async () => {
    const answers = [jsonResponse(503), jsonResponse(200, [historySet])];
    stubCatalog(() => answers.shift() ?? jsonResponse(500));

    renderApp('/sets');

    expect(await screen.findByText(historySet.title, {}, { timeout: 3_000 })).toBeDefined();
    expect(answers).toHaveLength(0);
  });

  it('offers Try again at once after any other failure', async () => {
    const catalogAnswer = vi.fn(() => jsonResponse(500));
    stubCatalog(catalogAnswer);

    renderApp('/sets');

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeDefined();
    expect(catalogAnswer).toHaveBeenCalledTimes(1);
  });

  it('says so when no set is available', async () => {
    stubFetch(200, []);

    renderApp('/sets');

    expect(await screen.findByRole('heading', { name: 'No reviewers are available right now.' })).toBeDefined();
  });
});
