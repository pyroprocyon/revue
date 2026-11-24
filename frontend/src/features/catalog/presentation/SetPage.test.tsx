import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { historyCards, historySet, natureSet } from '../../../test/fixtures';
import { jsonResponse, renderApp, stubFetch } from '../../../test/renderApp';

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
  it('opens a short share link and preserves the intended trial destination', async () => {
    const fetchMock = stubFetch(200, { ...historySet, shareCode: '1' });
    renderApp('/s/1');
    await screen.findByRole('heading', { level: 1, name: 'Philippine History' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/public-sets/share/1/summary', expect.anything());
    expect(screen.getByRole('link', { name: /Try 5 cards/ }).getAttribute('href')).toBe('/sets/philippine-history/try');
  });

  it('shows unavailable for an unknown short share code', async () => {
    stubFetch(404);
    renderApp('/s/unknown');
    expect(await screen.findByRole('heading', { name: "This reviewer isn't available right now." })).toBeDefined();
  });

  it('shows the set, its publisher and checking status, and the way into its trial', async () => {
    const fetchMock = stubFetch(200, historySet);

    renderApp(SET_PAGE);

    expect(await screen.findByRole('heading', { level: 1, name: 'Philippine History' })).toBeDefined();
    expect(screen.getByText('Five moments from Mactan to Malolos.')).toBeDefined();
    expect(screen.getByText('Published by Revue')).toBeDefined();
    expect(screen.queryByText('Not yet checked')).toBeNull();
    expect(screen.getByText('5 cards')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Try 5 cards' }).getAttribute('href')).toBe(`${SET_PAGE}/try`);
    expect(screen.getByRole('link', { name: 'All reviewers' }).getAttribute('href')).toBe('/sets');
    expect(fetchMock).toHaveBeenCalledWith(SET_API, expect.anything());
  });

  it('opens at once from the set list, before its own request answers', async () => {
    // The set's own request never answers here, so only the list's copy can fill the page.
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/api/v1/public-sets/catalog/onboarding'
          ? Promise.resolve(jsonResponse(200, [historySet, natureSet]))
          : new Promise(() => {}),
      ),
    );
    renderApp('/sets');

    fireEvent.click(await screen.findByRole('link', { name: /^Philippine History/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Philippine History' })).toBeDefined();
    expect(screen.queryByText('Loading the reviewer…')).toBeNull();
  });

  it('turns off the trial and says why when fewer than five cards are available', async () => {
    const fetchMock = stubFetch(200, { ...historySet, cardCount: 4, trialAvailable: false });

    renderApp(SET_PAGE);

    const tryButton = await screen.findByRole('button', { name: 'Try 5 cards' });
    expect((tryButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('link', { name: 'Try 5 cards' })).toBeNull();
    expect(screen.getByText('The trial needs 5 cards, and this reviewer has 4 cards right now.')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalledWith(`${SET_API}/demo-cards`, expect.anything());
  });

  it('shows the first trial question and groups the trial and Library actions', async () => {
    const fetchMock = vi.fn(async (path: string) => {
      if (path === `${SET_API}/demo-cards`) return jsonResponse(200, historyCards);
      if (path === '/api/v1/sets/1/save') return jsonResponse(200, { saved: false });
      return jsonResponse(200, { ...historySet, saveAllowed: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(SET_PAGE);

    const sample = await screen.findByRole('heading', { name: 'Sample question' });
    expect(sample).toBeDefined();
    expect(screen.getByText(historyCards.cards[0]!.question)).toBeDefined();
    expect(screen.queryByText(historyCards.cards[0]!.answer)).toBeNull();
    expect(screen.queryByText(historyCards.cards[1]!.question)).toBeNull();
    expect(screen.getByRole('link', { name: 'Try 5 cards' }).getAttribute('href')).toBe(`${SET_PAGE}/try`);
    const actions = within(screen.getByRole('group', { name: 'Reviewer actions' }));
    expect(await actions.findByRole('button', { name: 'Save to Library' })).toBeDefined();
    const warning = screen.getByText('Trial progress and ratings aren’t saved.');
    expect(actions.getByRole('link', { name: 'Try 5 cards' }).getAttribute('aria-describedby')).toBe(warning.id);
    expect(actions.queryByText(warning.textContent!)).toBeNull();
  });

  it('retries the sample when the catalog is busy', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path !== `${SET_API}/demo-cards`) return jsonResponse(200, historySet);
        return ++attempts === 1 ? jsonResponse(503) : jsonResponse(200, historyCards);
      }),
    );
    renderApp(SET_PAGE);

    expect(await screen.findByRole('heading', { name: 'Sample question' }, { timeout: 2_500 })).toBeDefined();
    expect(attempts).toBe(2);
  });

  it('keeps the trial link available when the sample request fails', async () => {
    const trialPath = `${SET_API}/demo-cards`;
    const fetchMock = vi.fn(async (path: string) =>
      path === trialPath ? jsonResponse(500) : jsonResponse(200, historySet),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderApp(SET_PAGE);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(trialPath, expect.anything()));
    expect(screen.getByRole('link', { name: 'Try 5 cards' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Sample question' })).toBeNull();
  });

  it('says the set is unavailable when the server does not offer it, and points to the others', async () => {
    stubFetch(404);

    renderApp(SET_PAGE);

    expect(await screen.findByRole('heading', { name: "This reviewer isn't available right now." })).toBeDefined();
    expect(screen.getByRole('link', { name: 'See all reviewers' }).getAttribute('href')).toBe('/sets');
    expect(screen.queryByText('Try 5 cards')).toBeNull();
  });

  it('offers a retry after a failed load, and the retry shows the set', async () => {
    let setAttempts = 0;
    const fetchMock = vi.fn(async (path: string) => {
      if (path === SET_API && ++setAttempts === 1) return jsonResponse(500);
      return path === SET_API ? jsonResponse(200, historySet) : jsonResponse(401);
    });
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
    const copy = await screen.findByRole('button', { name: 'Copy link' });
    vi.useFakeTimers();
    try {
      copy.focus();
      await act(async () => {
        fireEvent.click(copy);
      });
      expect(screen.getByRole('button', { name: 'Copied. Copy link again' })).toBe(copy);
      expect(screen.getByText('Link copied.').className).toBe('sr-only');
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/1`);

      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByRole('button', { name: 'Copy link' })).toBe(copy);
      expect(document.activeElement).toBe(copy);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the link to copy by hand when the clipboard is unavailable', async () => {
    stubFetch(200, historySet);

    renderApp(SET_PAGE);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    expect(await screen.findByText(`Couldn't copy the link. Here it is: ${window.location.origin}/s/1`)).toBeDefined();
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

    expect(share).toHaveBeenCalledWith({ title: 'Philippine History', url: `${window.location.origin}/s/1` });
  });
});
