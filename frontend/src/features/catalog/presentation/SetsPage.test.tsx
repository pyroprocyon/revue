import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { historySet, natureSet } from '../../../test/fixtures';
import { renderApp, stubFetch } from '../../../test/renderApp';

describe('Set list', () => {
  it('lists every public set, each opening its own preview', async () => {
    stubFetch(200, [historySet, natureSet]);

    renderApp('/sets');

    expect(await screen.findByRole('heading', { level: 1, name: 'Practice sets' })).toBeDefined();
    expect(screen.getByText('Practice only. Nothing is saved.')).toBeDefined();
    expect(screen.getByText('That includes your progress and ratings, even when you’re signed in.')).toBeDefined();
    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/sets/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/sets/philippine-history',
      '/sets/philippine-nature',
    ]);
    expect(links[0].textContent).toContain('Five moments from Mactan to Malolos.');
  });

  it('says so when no set is available', async () => {
    stubFetch(200, []);

    renderApp('/sets');

    expect(await screen.findByRole('heading', { name: 'No sets are available right now.' })).toBeDefined();
  });
});
