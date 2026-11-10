import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { historySet, natureSet } from '../test/fixtures';
import { renderApp, stubFetch } from '../test/renderApp';

describe('App', () => {
  it('opens signup directly at the short invitation route', async () => {
    stubFetch(404);
    renderApp('/i');
    expect(screen.getByRole('textbox', { name: /^Username/ })).toBeDefined();
  });

  it('leads the home page with the headline and the way into the sets', () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Review before it’s due.' })).toBeDefined();
    expect(screen.getByText('You focus on remembering. Revue handles the timing.')).toBeDefined();
    // Phones pin the button at the bottom and desktops show it in the hero; CSS shows one of them.
    const browseLinks = screen.getAllByRole('link', { name: 'Browse sets' });
    expect(browseLinks.map((link) => link.getAttribute('href'))).toEqual(['/sets', '/sets']);
    expect(screen.getAllByText('No account needed. Practice isn’t saved.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/free/i)).toBeNull();
  });

  it('says "review" only in the headline, using practice, set and comes back elsewhere', () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    const mentions = screen.getAllByText(/\breview/i);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].closest('h1')).not.toBeNull();
  });

  it('loads the list of sets in the background, so Browse sets opens without waiting', async () => {
    const fetchMock = stubFetch(200, [historySet, natureSet]);

    renderApp('/');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/public-sets', expect.anything()));
  });

  it('has one How it works link, for phones, pointing at the steps on the same page', () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    // jsdom applies no CSS, so this checks the link count; the desktop screenshots check it is hidden there.
    expect(screen.getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('#how-it-works');
    const section = document.getElementById('how-it-works');
    expect(section?.textContent).toContain('How Revue decides when cards come back');
    expect(section?.textContent).toContain('Try to remember.');
    expect(section?.textContent).toContain('That’s spaced repetition.');
  });

  it('shows a sample card from the sets with the real rating look, and nothing to press', () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    const sample = screen.getByRole('figure', { name: 'Sample card' });
    expect(sample.textContent).toContain('Who wrote Noli Me Tangere?');
    expect(sample.textContent).toContain('Hard: Right, with effort');
    expect(sample.textContent).toContain('Comes back');
    expect(sample.textContent).toContain('Example schedule');
    expect(sample.querySelectorAll('a, button, input')).toHaveLength(0);
  });

  it('shows a not-found page for an unknown route', () => {
    renderApp('/no-such-page');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found.' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/');
  });
});
