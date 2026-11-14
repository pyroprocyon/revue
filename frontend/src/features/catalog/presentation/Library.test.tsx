import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { historySet } from '../../../test/fixtures';
import { jsonResponse, renderApp } from '../../../test/renderApp';

const setPath = '/sets/philippine-history';
const savePath = `/api/v1/sets/${Number.parseInt(historySet.shareCode, 36)}/save`;
const savedSet = { id: '1', setKey: historySet.setKey, title: historySet.title, description: historySet.description,
  publisherName: historySet.publisherName, cardCount: 5, retired: false, saveAllowed: true, savedAt: '2026-11-13T00:00:00Z' };

function api({ signedIn = true, saved = false, retired = false, save = async () => jsonResponse(200, savedSet), remove = async () => jsonResponse(204) } = {}) {
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/auth/session') return jsonResponse(200, { signedIn });
    if (path === '/api/v1/me') return jsonResponse(signedIn ? 200 : 401, { username: 'learner' });
    if (path === '/api/v1/auth/csrf') return jsonResponse(200, { token: 'csrf', headerName: 'X-XSRF-TOKEN' });
    if (path === '/api/v1/public-sets/philippine-history') return jsonResponse(200, { ...historySet, saveAllowed: true });
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
    if (path === '/api/v1/me/saved-sets') return jsonResponse(200, { items: saved ? [{ ...savedSet, retired }] : [], nextCursor: null });
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
    const fetcher = api({ save: () => new Promise((resolve) => { finish = resolve; }) });
    renderApp(setPath);
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Library' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true);
    expect(screen.queryByText('Saved to your Library')).toBeNull();
    await waitFor(() => expect(finish).toBeDefined());
    finish(jsonResponse(200, savedSet));
    expect(await screen.findByText('Saved to your Library')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open Library' }).getAttribute('href')).toBe('/library');
    expect(fetcher).toHaveBeenCalledWith(savePath, expect.objectContaining({ method: 'POST', headers: { 'X-XSRF-TOKEN': 'csrf' } }));
  });

  it('keeps an unknown result unconfirmed and permits a safe retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new TypeError('connection lost')).mockResolvedValueOnce(jsonResponse(200, savedSet));
    api({ save });
    renderApp(setPath);
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Library' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'We couldn’t confirm the save. Trying again won’t create a duplicate.');
    expect(screen.queryByText('Saved to your Library')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try saving again' }));
    expect(await screen.findByText('Saved to your Library')).toBeDefined();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404])('handles a save rejected with HTTP %i without claiming success', async (status) => {
    api({ save: async () => jsonResponse(status) });
    renderApp(setPath);
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Library' }));
    if (status === 401) expect(await screen.findByRole('link', { name: 'Sign in to save' })).toBeDefined();
    else expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByText('Saved to your Library')).toBeNull();
  });

  it('rechecks the current session after a save instead of attributing the old account response to a new account', async () => {
    let posted = false;
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/public-sets/philippine-history') return jsonResponse(200, { ...historySet, saveAllowed: true });
      if (path === '/api/v1/auth/csrf') return jsonResponse(200, { token: 'csrf', headerName: 'X-XSRF-TOKEN' });
      if (path === savePath && init?.method === 'POST') { posted = true; return jsonResponse(200, savedSet); }
      // Represents a different session whose membership is still empty after the first account's save.
      if (path === savePath) return jsonResponse(200, { saved: false });
      return jsonResponse(404);
    }));
    renderApp(setPath);
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Library' }));
    await waitFor(() => expect(posted).toBe(true));
    expect(await screen.findByRole('button', { name: 'Save to Library' })).toBeDefined();
    expect(screen.queryByText('Saved to your Library')).toBeNull();
  });

  it('loads already saved state without another write', async () => {
    const fetcher = api({ saved: true });
    renderApp(setPath);
    expect(await screen.findByRole('link', { name: 'Open Library' })).toBeDefined();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toEqual([]);
  });

  it('distinguishes an empty library from a finished review day', async () => {
    api();
    renderApp('/library');
    expect(await screen.findByRole('heading', { name: 'No saved sets' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/today');
  });

  it('reads the saved Library after mounting the verified account boundary', async () => {
    api({ saved: true });
    renderApp('/library');
    expect(await screen.findByRole('heading', { name: historySet.title })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Library' }).getAttribute('aria-current')).toBe('page');
  });

  it('waits for confirmed removal before updating Library', async () => {
    let finish!: (response: Response) => void;
    const fetcher = api({ saved: true, remove: () => new Promise(resolve => { finish = resolve; }) });
    renderApp('/library');
    fireEvent.click(await screen.findByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    expect(await screen.findByRole('button', { name: 'Removing…' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('heading', { name: historySet.title })).toBeDefined();
    await waitFor(() => expect(finish).toBeDefined());
    finish(jsonResponse(204));
    expect(await screen.findByText(`Removed “${historySet.title}” from your Library. Your progress is kept.`)).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'No saved sets' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: historySet.title })).toBeNull();
    expect(fetcher).toHaveBeenCalledWith(savePath, expect.objectContaining({ method: 'DELETE', headers: { 'X-XSRF-TOKEN': 'csrf' } }));
  });

  it('warns before removing a retired set and supports cancelling', async () => {
    const fetcher = api({ saved: true, retired: true });
    renderApp('/library');
    fireEvent.click(await screen.findByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    expect(screen.getByText(/you won’t be able to save it again/)).toBeDefined();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Keep set' }));
    expect(screen.queryByText(/you won’t be able to save it again/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Library' }));
    expect(await screen.findByRole('heading', { name: 'No saved sets' })).toBeDefined();
  });

  it('finishes confirmed removal even when the following Library refresh stalls', async () => {
    let removed = false;
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/me') return jsonResponse(200, { username: 'learner' });
      if (path === '/api/v1/auth/csrf') return jsonResponse(200, { token: 'csrf', headerName: 'X-XSRF-TOKEN' });
      if (path === savePath) {
        if (init?.method === 'DELETE') { removed = true; return jsonResponse(204); }
        return jsonResponse(200, { saved: !removed });
      }
      if (path === '/api/v1/me/saved-sets') {
        if (removed) return new Promise<Response>(() => {});
        return jsonResponse(200, { items: [savedSet], nextCursor: null });
      }
      return jsonResponse(404);
    }));
    renderApp('/library');
    fireEvent.click(await screen.findByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    expect(await screen.findByText(`Removed “${historySet.title}” from your Library. Your progress is kept.`)).toBeDefined();
    expect(screen.queryByRole('heading', { name: historySet.title })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Removing…' })).toBeNull();
  });

  it('does not claim removal after a lost response and offers retry', async () => {
    const remove = vi.fn().mockRejectedValueOnce(new TypeError('connection lost')).mockResolvedValueOnce(jsonResponse(204));
    api({ saved: true, remove });
    renderApp('/library');
    fireEvent.click(await screen.findByRole('button', { name: `Remove from Library: ${historySet.title}` }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'We couldn’t confirm removal. Please try again. Your progress is kept.');
    expect(screen.getByRole('heading', { name: historySet.title })).toBeDefined();
    expect(screen.queryByText(/^Removed “/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try removing again' }));
    expect(await screen.findByRole('heading', { name: 'No saved sets' })).toBeDefined();
  });
});
