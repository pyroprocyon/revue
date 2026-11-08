import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { historySet, natureSet } from '../test/fixtures';
import { jsonResponse, renderApp, stubFetch } from '../test/renderApp';

const SET_PAGE = '/sets/philippine-history';
const SET_API = '/api/v1/public-sets/philippine-history';

// jsdom has no clipboard or share sheet, so tests add them to navigator and remove them after.
function addToNavigator(property: 'clipboard' | 'share', value: unknown) {
  Object.defineProperty(navigator, property, { value, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(navigator, 'share');
});

describe('Set preview', () => {
  it('shows the set, its publisher and checking status, and the way into its trial', async () => {
    const fetchMock = stubFetch(200, historySet);

    renderApp(SET_PAGE);

    expect(await screen.findByRole('heading', { level: 1, name: 'Philippine History' })).toBeDefined();
    expect(screen.getByText('Five moments from Mactan to Malolos.')).toBeDefined();
    expect(screen.getByText('Published by Revue')).toBeDefined();
    expect(screen.getByText('Not yet checked')).toBeDefined();
    expect(screen.getByText('5 cards')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Try 5 cards' }).getAttribute('href')).toBe(`${SET_PAGE}/try`);
    expect(screen.getByText('This practice isn’t saved.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'All sets' }).getAttribute('href')).toBe('/sets');
    expect(fetchMock).toHaveBeenCalledWith(SET_API, expect.anything());
  });

  it('opens at once from the set list, before its own request answers', async () => {
    // The set's own request never answers here, so only the list's copy can fill the page.
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/api/v1/public-sets' ? Promise.resolve(jsonResponse(200, [historySet, natureSet])) : new Promise(() => {}),
      ),
    );
    renderApp('/sets');

    fireEvent.click(await screen.findByRole('link', { name: /^Philippine History/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Philippine History' })).toBeDefined();
    expect(screen.queryByText('Loading the set…')).toBeNull();
  });

  it('turns off the trial and says why when fewer than five cards are available', async () => {
    const fetchMock = stubFetch(200, { ...historySet, cardCount: 4, trialAvailable: false });

    renderApp(SET_PAGE);

    const tryButton = await screen.findByRole('button', { name: 'Try 5 cards' });
    expect((tryButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('link', { name: 'Try 5 cards' })).toBeNull();
    expect(screen.getByText('The trial needs 5 cards, and this set has 4 cards right now.')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalledWith(`${SET_API}/demo-cards`, expect.anything());
  });

  it('loads the trial cards in the background, so the trial opens without waiting', async () => {
    const fetchMock = stubFetch(200, historySet);

    renderApp(SET_PAGE);
    await screen.findByRole('heading', { level: 1, name: 'Philippine History' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`${SET_API}/demo-cards`, expect.anything()));
  });

  it('says the set is unavailable when the server does not offer it, and points to the others', async () => {
    stubFetch(404);

    renderApp(SET_PAGE);

    expect(await screen.findByRole('heading', { name: "This set isn't available right now." })).toBeDefined();
    expect(screen.getByRole('link', { name: 'See all sets' }).getAttribute('href')).toBe('/sets');
    expect(screen.queryByText('Try 5 cards')).toBeNull();
  });

  it('offers a retry after a failed load, and the retry shows the set', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500))
      .mockResolvedValue(jsonResponse(200, historySet));
    vi.stubGlobal('fetch', fetchMock);

    renderApp(SET_PAGE);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Philippine History' })).toBeDefined();
    const setCalls = fetchMock.mock.calls.filter(([path]) => path === SET_API);
    expect(setCalls).toHaveLength(2);
  });

  it('copies the public link, which carries nothing about the visitor', async () => {
    stubFetch(200, historySet);
    const writeText = vi.fn(async () => {});
    addToNavigator('clipboard', { writeText });

    renderApp(SET_PAGE);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    expect(await screen.findByText('Link copied.')).toBeDefined();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${SET_PAGE}`);
  });

  it('shows the link to copy by hand when the clipboard is unavailable', async () => {
    stubFetch(200, historySet);

    renderApp(SET_PAGE);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    expect(
      await screen.findByText(`Couldn't copy the link. Here it is: ${window.location.origin}${SET_PAGE}`),
    ).toBeDefined();
  });

  it('offers the share sheet only where the browser has one', async () => {
    stubFetch(200, historySet);
    renderApp(SET_PAGE);
    await screen.findByRole('button', { name: 'Copy link' });
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('shares the public link through the share sheet', async () => {
    stubFetch(200, historySet);
    const share = vi.fn(async () => {});
    addToNavigator('share', share);

    renderApp(SET_PAGE);
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));

    expect(share).toHaveBeenCalledWith({ title: 'Philippine History', url: `${window.location.origin}${SET_PAGE}` });
  });
});
