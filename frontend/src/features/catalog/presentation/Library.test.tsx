import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { historySet } from '../../../test/fixtures';
import { jsonResponse, renderApp } from '../../../test/renderApp';
import { libraryKeys } from '../../../shared/cache/queryKeys';

const setPath = '/sets/philippine-history';
const savePath = `/api/v1/sets/${Number.parseInt(historySet.shareCode, 36)}/save`;
const savedSet = {
  id: '1',
  setKey: historySet.setKey,
  title: historySet.title,
  description: historySet.description,
  publisherName: historySet.publisherName,
  cardCount: 5,
  retired: false,
  saveAllowed: true,
  savedAt: '2026-11-13T00:00:00Z',
};

function api({
  signedIn = true,
  saved = false,
  retired = false,
  save = async () => jsonResponse(200, savedSet),
  remove = async () => jsonResponse(204),
  moreSaved = [] as (typeof savedSet)[],
} = {}) {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/auth/session') return jsonResponse(200, { signedIn });
    if (path === '/api/v1/me') return jsonResponse(signedIn ? 200 : 401, { username: 'learner' });
    if (path === '/api/v1/auth/csrf')
      return jsonResponse(200, { token: 'csrf', headerName: 'X-XSRF-TOKEN', username: 'learner' });
    if (path === '/api/v1/public-sets/philippine-history')
      return jsonResponse(200, { ...historySet, saveAllowed: true });
    if (path === savePath) {
      if (init?.method === 'DELETE') {
        const response = await remove();
        if (response.ok) saved = false;
        return response;
      }
      if (init?.method === 'POST') {
        const response = await save();
        if (response.ok) saved = true;
        return response;
      }
      return jsonResponse(signedIn ? 200 : 401, { saved });
    }
    if (path === '/api/v1/decks') return jsonResponse(200, { items: [] });
    if (/^\/api\/v1\/me\/saved-sets\/\d+\/cards(?:\?|$)/.test(path))
      return jsonResponse(saved ? 200 : 404, {
        deck: { id: savedSet.id, title: savedSet.title, cardCount: savedSet.cardCount, archived: false },
        progress: { dueCards: 0, newCards: savedSet.cardCount, newCardsLeftToday: 10, nextReviewDate: null },
        items: [],
        dueCardIds: [],
        nextCursor: null,
      });
    if (path === `/api/v1/me/saved-sets/${savedSet.id}`)
      return jsonResponse(saved ? 200 : 404, { ...savedSet, retired });
    if (path === '/api/v1/me/saved-sets?limit=50&paused=false')
      return jsonResponse(200, { items: saved ? [{ ...savedSet, retired }, ...moreSaved] : [], nextCursor: null });
    return jsonResponse(404);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('saved shared sets', () => {
  it('sends signed-out visitors to sign-in with a fixed preview return and never saves implicitly', async () => {
    const fetcher = api({ signedIn: false });
    renderApp(setPath);
    const signIn = await screen.findByRole('link', { name: 'Sign in to save' });
    expect(signIn.getAttribute('href')).toBe('/sign-in?returnTo=%2Fsets%2Fphilippine-history');
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toEqual([]);
  });

  it('waits for confirmation then exposes Library and sends a CSRF-protected explicit POST', async () => {
    let finish!: (response: Response) => void;
    const fetcher = api({
      save: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    renderApp(setPath);
    const save = await screen.findByRole('button', { name: 'Save to Library' });
    save.focus();
    fireEvent.click(save);
    expect(await screen.findByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true);
    expect(screen.queryByText('Saved')).toBeNull();
    await waitFor(() => expect(finish).toBeDefined());
    finish(jsonResponse(200, savedSet));
    const open = await screen.findByRole('link', { name: 'Open Library', description: 'Saved to your Library' });
    expect(open).toBe(document.activeElement);
    expect(open.className).toContain(save.className);
    expect(open.getAttribute('href')).toBe('/library?shelf=saved&set=1');
    expect(open.contains(await screen.findByText('Saved'))).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      savePath,
      expect.objectContaining({ method: 'POST', headers: { 'X-XSRF-TOKEN': 'csrf' } }),
    );
  });

  it('keeps an unknown result unconfirmed and permits a safe retry', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(jsonResponse(200, savedSet));
    api({ save });
    renderApp(setPath);
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Library' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'We couldn’t confirm the save. Trying again won’t create a duplicate.',
    );
    expect(screen.queryByText('Saved')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try saving again' }));
    expect(await screen.findByText('Saved')).toBeDefined();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('explains the saved-set limit and links to the shelf where the learner can make room', async () => {
    api({ save: async () => jsonResponse(409) });
    renderApp(setPath);
    const save = await screen.findByRole('button', { name: 'Save to Library' });
    save.focus();
    fireEvent.click(save);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Your Library holds up to 50 saved reviewers. Remove a reviewer to make room.',
    );
    const library = screen.getByRole('link', { name: 'Open Library' });
    expect(library.getAttribute('href')).toBe('/library?shelf=saved');
    expect(document.activeElement).toBe(library);
  });

  it.each([401, 403, 404])('handles a save rejected with HTTP %i without claiming success', async (status) => {
    api({ save: async () => jsonResponse(status) });
    renderApp(setPath);
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Library' }));
    if (status === 401) expect(await screen.findByRole('link', { name: 'Sign in to save' })).toBeDefined();
    else expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('rechecks the current session after a save instead of attributing the old account response to a new account', async () => {
    let posted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === '/api/v1/public-sets/philippine-history')
          return jsonResponse(200, { ...historySet, saveAllowed: true });
        if (path === '/api/v1/auth/csrf')
          return jsonResponse(200, { token: 'csrf', headerName: 'X-XSRF-TOKEN', username: 'learner' });
        if (path === savePath && init?.method === 'POST') {
          posted = true;
          return jsonResponse(200, savedSet);
        }
        // Represents a different session whose membership is still empty after the first account's save.
        if (path === savePath) return jsonResponse(200, { saved: false });
        return jsonResponse(404);
      }),
    );
    renderApp(setPath);
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Library' }));
    await waitFor(() => expect(posted).toBe(true));
    expect(await screen.findByRole('button', { name: 'Save to Library' })).toBeDefined();
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('loads already saved state without another write', async () => {
    const fetcher = api({ saved: true });
    renderApp(setPath);
    expect(await screen.findByRole('link', { name: 'Open Library' })).toBeDefined();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toEqual([]);
  });

  it('keeps the saved row on return while checking the same session, then checks again for a new session', async () => {
    const revisionKey = 'revue.session-revision';
    localStorage.setItem(revisionKey, 'first-session');
    const fetcher = api({ saved: true });
    const { router } = renderApp(setPath);
    const savedLink = () => screen.getByRole('link', { name: 'Open Library' });
    await screen.findByRole('link', { name: 'Open Library' });
    await act(() => router.navigate('/help'));

    const respond = fetcher.getMockImplementation()!;
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const refresh = vi.fn(() => pending);
    fetcher.mockImplementation((path, init) => (path === savePath ? refresh() : respond(path, init)));
    await act(() => router.navigate(-1));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const visibleDuringRefresh = savedLink();
    await act(() => finish(jsonResponse(200, { saved: true })));
    expect(savedLink()).toBe(visibleDuringRefresh);

    fetcher.mockImplementation((path, init) =>
      path === savePath ? Promise.resolve(jsonResponse(200, { saved: false })) : respond(path, init),
    );
    await act(() => {
      localStorage.setItem(revisionKey, 'second-session');
      window.dispatchEvent(new StorageEvent('storage', { key: revisionKey, newValue: 'second-session' }));
    });
    expect(await screen.findByRole('button', { name: 'Save to Library' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Open Library' })).toBeNull();
  });

  it('keeps the confirmed Save action in place while saved status refreshes', async () => {
    const fetcher = api();
    const { queryClient } = renderApp(setPath);
    const save = await screen.findByRole('button', { name: 'Save to Library' });
    const respond = fetcher.getMockImplementation()!;
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    fetcher.mockImplementation((path, init) => (path === savePath ? pending : respond(path, init)));

    const refresh = queryClient.invalidateQueries({ queryKey: libraryKeys.membership(savedSet.id) });
    await waitFor(() => expect(save.getAttribute('aria-disabled')).toBe('true'));
    expect(screen.getByRole('button', { name: 'Save to Library' })).toBe(save);
    fireEvent.click(save);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    finish(jsonResponse(200, { saved: true }));
    await refresh;
    expect(await screen.findByRole('link', { name: 'Open Library' })).toBeDefined();
  });

  it.each([
    ['/library', 'Loading your Library…', 'Open Java notes'],
    ['/library?shelf=saved&set=1', 'Loading the saved reviewer…', 'Philippine History'],
  ])('waits for the correct shelf on a cold visit to %s', async (path, waiting, ready) => {
    const fetcher = api({ saved: true });
    const respond = fetcher.getMockImplementation()!;
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    fetcher.mockImplementation((url, init) => {
      if (url === `/api/v1/me/saved-sets/${savedSet.id}` || url.startsWith('/api/v1/me/saved-sets?')) return pending;
      if (url === '/api/v1/decks')
        return Promise.resolve(jsonResponse(200, { items: [{ id: '8', title: 'Java notes', cardCount: 3 }] }));
      return respond(url, init);
    });
    renderApp(path);
    await screen.findByText(waiting);
    expect(screen.queryByRole('link', { name: 'Open Java notes' })).toBeNull();
    const linkedSet = path.includes('set=');
    finish(jsonResponse(200, linkedSet ? savedSet : { items: [savedSet], nextCursor: null }));
    const role = linkedSet ? 'heading' : 'link';
    expect(await screen.findByRole(role, { name: ready })).toBeDefined();
  });

  it('shows deck creation and hides the saved sets section when no sets are saved', async () => {
    api();
    renderApp('/library');
    expect(await screen.findByRole('link', { name: 'Create a deck' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Saved reviewers' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/today');
  });

  it('reads the saved Library after mounting the verified account boundary', async () => {
    api({ saved: true });
    renderApp('/library');
    expect(await screen.findByRole('link', { name: `Open ${historySet.title}` })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Saved reviewers' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Library' }).getAttribute('aria-current')).toBe('page');
  });

  it('searches saved sets with the same clearable field as decks', async () => {
    api({
      saved: true,
      moreSaved: [{ ...savedSet, id: '2', setKey: 'philippine-nature', title: 'Philippine Nature' }],
    });
    renderApp('/library?shelf=saved');
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search reviewers' }), {
      target: { value: 'Nature' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear reviewer search' }));

    const search = screen.getByRole('searchbox', { name: 'Search reviewers' });
    expect(search).toHaveProperty('value', '');
    expect(document.activeElement).toBe(search);
  });

  it('waits for confirmed removal before updating Library', async () => {
    let finish!: (response: Response) => void;
    const fetcher = api({
      saved: true,
      remove: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    renderApp('/library?shelf=saved&set=1');
    fireEvent.click(await screen.findByRole('button', { name: 'Reviewer settings' }));
    fireEvent.click(await screen.findByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    expect(screen.getByText(/Your progress is kept/)).toBeDefined();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
    expect(await screen.findByRole('button', { name: 'Removing…' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('heading', { name: historySet.title })).toBeDefined();
    await waitFor(() => expect(finish).toBeDefined());
    finish(jsonResponse(204));
    expect(
      await screen.findByText(`Removed “${historySet.title}” from your Library. Your progress is kept.`),
    ).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Saved reviewers' })).toBeNull();
    expect(screen.queryByRole('heading', { name: historySet.title })).toBeNull();
    expect(fetcher).toHaveBeenCalledWith(
      savePath,
      expect.objectContaining({ method: 'DELETE', headers: { 'X-XSRF-TOKEN': 'csrf', 'X-Revue-Learner': 'learner' } }),
    );
  });

  it('updates saved membership without leaving the current tab after a background removal', async () => {
    let finish!: (response: Response) => void;
    const fetcher = api({
      saved: true,
      remove: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const { queryClient, router } = renderApp('/library?shelf=saved&set=1');
    await screen.findByRole('heading', { name: historySet.title });
    queryClient.setQueryData(libraryKeys.savedKeys('learner'), [savedSet.setKey]);
    fireEvent.click(screen.getByRole('button', { name: 'Reviewer settings' }));
    fireEvent.click(await screen.findByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
    await waitFor(() => expect(finish).toBeDefined());

    fireEvent.click(screen.getByRole('link', { name: 'Account' }));
    await screen.findByRole('heading', { name: 'Your account' });
    await act(async () => {
      finish(jsonResponse(204));
    });
    await waitFor(() => expect(queryClient.getQueryData(libraryKeys.savedKeys('learner'))).toEqual([]));
    expect(router.state.location.pathname).toBe('/account');
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeDefined();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
  });

  it('keeps the Saved shelf and status menu available after a Paused read fails', async () => {
    const fetcher = api({ saved: true });
    const respond = fetcher.getMockImplementation()!;
    const active = '/api/v1/me/saved-sets?limit=50&paused=false';
    const paused = '/api/v1/me/saved-sets?limit=50&paused=true';
    const pausedSet = { ...savedSet, id: '2', title: 'Paused reviewer', reviewsPaused: true };
    const counts = { active: 1, paused: 1 };
    let attempts = 0;
    fetcher.mockImplementation(async (path, init) => {
      if (path === active) return jsonResponse(200, { items: [savedSet], nextCursor: null, counts });
      if (path === paused)
        return ++attempts < 3 ? jsonResponse(503) : jsonResponse(200, { items: [pausedSet], nextCursor: null, counts });
      return respond(path, init);
    });
    const { router } = renderApp('/library?shelf=saved');
    expect(await screen.findByRole('link', { name: `Open ${savedSet.title}` })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Review status: Active' }));
    fireEvent.click(screen.getByRole('button', { name: /^Paused/ }));
    await screen.findByRole('alert');
    expect(router.state.location.search).toBe('?shelf=saved&setStatus=paused');
    expect(screen.getByRole('button', { name: /^Saved/, pressed: true })).toBeDefined();
    expect(screen.queryByText('No paused saved reviewers.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Review status: Paused' }));
    fireEvent.click(screen.getByRole('button', { name: /^Active/ }));
    await screen.findByRole('link', { name: `Open ${savedSet.title}` });
    fireEvent.click(screen.getByRole('button', { name: 'Review status: Active' }));
    fireEvent.click(screen.getByRole('button', { name: /^Paused/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry saved reviewers' }));
    expect(await screen.findByRole('link', { name: 'Open Paused reviewer' })).toBeDefined();
  });

  it('warns before removing a retired set and supports cancelling', async () => {
    const fetcher = api({ saved: true, retired: true });
    renderApp('/library?shelf=saved&set=1');
    fireEvent.click(await screen.findByRole('button', { name: 'Reviewer settings' }));
    fireEvent.click(await screen.findByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    expect(screen.getByText(/you won’t be able to save it again/)).toBeDefined();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /^Keep$/ }));
    expect(screen.queryByText(/you won’t be able to save it again/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Saved reviewers' })).toBeNull());
  });

  it('finishes confirmed removal even when the following Library refresh stalls', async () => {
    let removed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === `/api/v1/me/saved-sets/${savedSet.id}`) return jsonResponse(200, savedSet);
        if (path === '/api/v1/me') return jsonResponse(200, { username: 'learner' });
        if (path === '/api/v1/auth/csrf')
          return jsonResponse(200, { token: 'csrf', headerName: 'X-XSRF-TOKEN', username: 'learner' });
        if (path === savePath) {
          if (init?.method === 'DELETE') {
            removed = true;
            return jsonResponse(204);
          }
          return jsonResponse(200, { saved: !removed });
        }
        if (path === '/api/v1/decks') return jsonResponse(200, { items: [] });
        if (path === '/api/v1/me/saved-sets?limit=50&paused=false') {
          if (removed) return new Promise<Response>(() => {});
          return jsonResponse(200, { items: [savedSet], nextCursor: null });
        }
        return jsonResponse(404);
      }),
    );
    renderApp('/library?shelf=saved&set=1');
    fireEvent.click(await screen.findByRole('button', { name: 'Reviewer settings' }));
    fireEvent.click(await screen.findByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
    expect(
      await screen.findByText(`Removed “${historySet.title}” from your Library. Your progress is kept.`),
    ).toBeDefined();
    expect(screen.queryByRole('heading', { name: historySet.title })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Removing…' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Saved/, pressed: true })).toBeNull();
  });

  it('does not claim removal after a lost response and offers retry', async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(jsonResponse(204));
    api({ saved: true, remove });
    renderApp('/library?shelf=saved&set=1');
    fireEvent.click(await screen.findByRole('button', { name: 'Reviewer settings' }));
    fireEvent.click(await screen.findByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'We couldn’t confirm removal. Please try again. Your progress is kept.',
    );
    expect(screen.getByRole('heading', { name: historySet.title })).toBeDefined();
    expect(screen.queryByText(/^Removed “/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try removing again' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Saved reviewers' })).toBeNull());
  });
});
