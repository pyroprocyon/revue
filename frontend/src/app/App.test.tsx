import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { historySet, natureSet } from '../test/fixtures';
import { jsonResponse, renderApp, stubFetch } from '../test/renderApp';

describe('App', () => {
  it.each(['signed-in', 'guest', 'unavailable'])('waits before choosing the homepage for a %s session', async (session) => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/v1/auth/session') return pending;
      if (path === '/api/v1/me') return jsonResponse(200, { username: 'learner' });
      if (path === '/api/v1/cards/due') return jsonResponse(200, {
        totalCards: 0, availableCards: 0, dueCards: 0, newCards: 0, nextReviewDate: null, cards: [],
      });
      return jsonResponse(200, []);
    }));
    renderApp('/');
    expect(screen.queryByRole('heading', { name: 'Review before it’s due.' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Checking your session…');
    expect(screen.queryByRole('heading', { name: 'Review before it’s due.' })).toBeNull();

    await act(async () => finish(session === 'unavailable'
      ? jsonResponse(503)
      : jsonResponse(200, { signedIn: session === 'signed-in' })));
    expect(await screen.findByRole('heading', {
      name: session === 'signed-in' ? 'Your review' : 'Review before it’s due.',
    })).toBeDefined();
  });

  it('opens signup directly at the short invitation route', async () => {
    stubFetch(404);
    renderApp('/i');
    expect(await screen.findByRole('textbox', { name: /^Username/ })).toBeDefined();
  });

  it('clears signup passwords and mismatch feedback when switching to sign-in', async () => {
    window.history.replaceState({}, '', '/i#viewtest');
    stubFetch(200, [historySet, natureSet]);
    renderApp('/i');
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'student' } });
    const password = crypto.randomUUID();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: password + 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Passwords don’t match.');
    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('Confirm password')).toBeNull();
  });

  it('moves focus to a policy page title, but leaves a section link on its own target', async () => {
    stubFetch(404);
    const page = renderApp('/privacy');
    const title = await screen.findByRole('heading', { name: 'Privacy notice' });
    expect(document.activeElement).toBe(title);
    page.unmount();

    // jsdom has no scrollIntoView, which the app calls for a section link.
    Element.prototype.scrollIntoView = vi.fn();
    try {
      renderApp('/terms#help-and-corrections');
      const terms = await screen.findByRole('heading', { level: 1 });
      expect(document.activeElement).not.toBe(terms);
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('leads the home page with the headline and the way into the sets', async () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Review before it’s due.' })).toBeDefined();
    expect(screen.getByText('You do the thinking. Revue handles the timing.')).toBeDefined();
    // CSS shows the hero or footer link according to the rendered layout.
    const browseLinks = screen.getAllByRole('link', { name: 'Browse sets' });
    expect(browseLinks.map((link) => link.getAttribute('href'))).toEqual(['/sets', '/sets']);
    expect(screen.queryByText(/free/i)).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Help and policies' })).toBeNull();
  });

  it('opens the invitation explanation from home and lets visitors continue browsing', async () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    // CSS chooses the phone or desktop action group in a real browser.
    fireEvent.click((await screen.findAllByRole('link', { name: 'Create account' }))[0]);
    expect(await screen.findByRole('heading', { name: 'You’ll need an invitation' })).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Browse sets' }));
    expect(await screen.findByRole('heading', { name: 'Shared sets' })).toBeDefined();
  });

  it('lets returning learners sign in from a direct visit to the invitation explanation', async () => {
    const fetchMock = stubFetch(404);
    renderApp('/join');

    expect(await screen.findByRole('heading', { name: 'You’ll need an invitation' })).toBeDefined();
    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/v1/auth/session', expect.anything());
  });

  it('says "review" only in the headline, using practice, set and comes back elsewhere', async () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    const mentions = await screen.findAllByText(/\breview/i);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].closest('h1')).not.toBeNull();
  });

  it('loads the list of sets in the background, so Browse sets opens without waiting', async () => {
    const fetchMock = stubFetch(200, [historySet, natureSet]);

    renderApp('/');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/public-sets', expect.anything()));
  });

  it('offers the guide inline on desktop and opens the separate page from the phone link', async () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    expect((await screen.findByRole('heading', { level: 2, name: 'How spaced repetition works' })).closest('section')?.id).toBe('how-it-works');
    fireEvent.click(screen.getByRole('link', { name: 'How it works' }));

    expect(screen.getByRole('heading', { level: 1, name: 'How spaced repetition works' })).toBeDefined();
    expect(screen.getByText('Answer from memory.')).toBeDefined();
    fireEvent.click(screen.getByRole('link', { name: 'Browse sets' }));
    expect(await screen.findByRole('heading', { name: 'Shared sets' })).toBeDefined();
  });

  it('shows a sample card from the sets with the real rating look, and nothing to press', async () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    const sample = await screen.findByRole('figure', { name: 'Sample card' });
    expect(sample.textContent).toContain('Who wrote Noli Me Tangere?');
    expect(sample.textContent).toContain('Hard: Right, with effort');
    expect(sample.textContent).toContain('Comes back');
    expect(sample.textContent).toContain('Example schedule');
    expect(sample.querySelectorAll('a, button, input')).toHaveLength(0);
  });

  it('shows a not-found page for an unknown route', async () => {
    stubFetch(404);
    renderApp('/no-such-page');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found.' })).toBeDefined();
    expect((await screen.findByRole('link', { name: 'Go to the home page' })).getAttribute('href')).toBe('/');
  });
});
