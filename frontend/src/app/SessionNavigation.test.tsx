import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { focusManager } from '@tanstack/react-query';
import { historyCards, historySet } from '../test/fixtures';
import { jsonResponse, renderApp } from '../test/renderApp';
import { primaryButton, secondaryButton } from '../shared/ui/buttonStyles';
import { shouldWaitForSession, saveSignedInHint } from '../shared/navigation/signedInHint';

function pendingSession() {
  let resolve!: (value: Response) => void;
  const response = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetcher = vi.fn(async (path: string) => {
    if (path === '/api/v1/auth/session') return response;
    if (path === '/api/v1/me') return jsonResponse(200, { username: 'learner' });
    if (path.split('?')[0] === '/api/v1/cards/due')
      return jsonResponse(200, {
        totalCards: 0,
        availableCards: 0,
        dueCards: 0,
        newCards: 0,
        nextReviewDate: null,
        cards: [],
      });
    if (path === '/api/v1/public-sets/philippine-history/demo-cards') return jsonResponse(200, historyCards);
    if (path === '/api/v1/public-sets/catalog/onboarding') return jsonResponse(200, [historySet]);
    return jsonResponse(404);
  });
  vi.stubGlobal('fetch', fetcher);
  return {
    fetcher,
    finish: (signedIn: boolean) => act(async () => resolve(jsonResponse(200, { signedIn }))),
    fail: () => act(async () => resolve(jsonResponse(503))),
  };
}

describe('session-dependent navigation', () => {
  it('aborts an in-flight public session check when another tab changes the session', async () => {
    let firstSignal: AbortSignal | null | undefined;
    let requests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path !== '/api/v1/auth/session') return jsonResponse(404);
        requests++;
        if (requests > 1) return jsonResponse(200, { signedIn: true });
        firstSignal = init?.signal;
        return new Promise<Response>((_, reject) => {
          firstSignal?.addEventListener('abort', () => reject(firstSignal?.reason), { once: true });
        });
      }),
    );
    renderApp('/privacy');
    await waitFor(() => expect(requests).toBe(1));
    expect(firstSignal?.aborted).toBe(false);

    await act(async () => {
      localStorage.setItem('revue.session-revision', 'other-tab-signed-in');
      window.dispatchEvent(new StorageEvent('storage', { key: 'revue.session-revision' }));
    });

    expect(await screen.findByRole('link', { name: 'Back to Today' })).toBeDefined();
    expect(requests).toBe(2);
    expect(firstSignal?.aborted).toBe(true);
  });

  it('opens sign-in after one account check and rechecks after another tab signs in', async () => {
    let signedIn = false;
    const fetcher = vi.fn(async (path: string) => {
      if (path === '/api/v1/me') return signedIn ? jsonResponse(200, { username: 'learner' }) : jsonResponse(401);
      if (path === '/api/v1/auth/session') return jsonResponse(200, { signedIn });
      return jsonResponse(404);
    });
    vi.stubGlobal('fetch', fetcher);
    const { router } = renderApp('/today');

    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(router.state.location.search).toBe('?returnTo=%2Ftoday');
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/v1/me']);

    signedIn = true;
    await act(async () => {
      localStorage.setItem('revue.session-revision', 'other-tab-signed-in');
      window.dispatchEvent(new StorageEvent('storage', { key: 'revue.session-revision' }));
    });
    await screen.findByRole('heading', { name: 'Your review' });
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/v1/auth/session')).toHaveLength(1);
  });

  it.each(['signed-in', 'guest', 'failed'])(
    'waits for a %s session when browser storage is blocked',
    async (outcome) => {
      const blocked = () => {
        throw new DOMException('Storage blocked', 'SecurityError');
      };
      vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
      const session = pendingSession();
      renderApp('/');
      expect(screen.queryByRole('heading', { name: 'Review before it’s due.' })).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
      expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Checking your session…');
      if (outcome === 'failed') await session.fail();
      else await session.finish(outcome === 'signed-in');
      expect(
        await screen.findByRole('heading', {
          name: outcome === 'signed-in' ? 'Your review' : 'Review before it’s due.',
        }),
      ).toBeDefined();
      expect(screen.queryByRole('status')).toBeNull();
    },
  );

  it.each(['/', '/sign-in', '/join', '/i', '/register'])(
    'keeps guest content and fast loading notices off the signed-in entry %s',
    async (path) => {
      saveSignedInHint(true);
      const session = pendingSession();
      renderApp(path);
      expect(screen.queryByRole('heading')).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
      await session.finish(true);
      await screen.findByRole('heading', { name: 'Your review' });
      expect(screen.queryByRole('textbox')).toBeNull();
    },
  );

  it('shows a guest the homepage at once, without a session notice', async () => {
    const session = pendingSession();
    renderApp('/');
    expect(screen.getByRole('heading', { name: 'Review before it’s due.' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    await session.finish(false);
    expect(await screen.findAllByRole('link', { name: 'Sign in' })).not.toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Review before it’s due.' })).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
    expect(shouldWaitForSession()).toBe(false);
  });

  it('sends a signed-in learner from the homepage to Today and saves the hint when the browser had none', async () => {
    const session = pendingSession();
    renderApp('/');
    expect(screen.getByRole('heading', { name: 'Review before it’s due.' })).toBeDefined();
    await session.finish(true);
    await screen.findByRole('heading', { name: 'Your review' });
    expect(shouldWaitForSession()).toBe(true);
  });

  it.each([
    ['/privacy', 'Privacy notice', 'Back to sign in', 'Back to Today'],
    ['/terms', 'Terms', 'Back to sign in', 'Back to Today'],
    ['/sets', 'Reviewers', 'Sign in', 'Account'],
    ['/missing-page', 'Page not found.', 'Go to the home page', 'Go to Today'],
  ])(
    'keeps public content readable without guessing the account action on %s',
    async (path, title, guestAction, accountAction) => {
      const session = pendingSession();
      renderApp(path);
      await screen.findByRole('heading', { name: title });
      expect(screen.queryByRole('link', { name: guestAction })).toBeNull();
      expect(screen.queryByRole('link', { name: accountAction })).toBeNull();
      await session.finish(true);
      expect(await screen.findByRole('link', { name: accountAction })).toBeDefined();
      expect(screen.queryByRole('link', { name: guestAction })).toBeNull();
    },
  );

  it.each([true, false])(
    'keeps completed trial actions neutral until the session is known (signed in: %s)',
    async (signedIn) => {
      const session = pendingSession();
      renderApp('/sets/philippine-history/try');
      await screen.findByRole('heading', { name: 'Question 1?' });
      for (let card = 0; card < 5; card++) {
        fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
        fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
      }
      const heading = screen.getByRole('heading', { name: 'You practiced 5 cards.' });
      const another = screen.getByRole('link', { name: 'Browse reviewers' });
      const back = screen.getByRole('link', { name: 'View topic details' });
      expect(another.className).toBe(secondaryButton);
      expect(back.className).toBe(secondaryButton);
      await session.finish(signedIn);
      await waitFor(() => expect((signedIn ? back : another).className).toBe(primaryButton));
      expect((signedIn ? another : back).className).toBe(secondaryButton);
      expect(document.activeElement).toBe(heading);
    },
  );

  it.each([
    { destination: '/library?shelf=saved&set=1', heading: 'Philippine History' },
    { destination: '/published?subject=Biology&q=cell', heading: 'Biology' },
  ])('returns to $destination after signing in', async ({ destination, heading }) => {
    let signedIn = false;
    const profile = { username: 'learner' };
    const reviewer = { ...historySet, id: '1', savedAt: '2026-11-13T00:00:00Z', retired: false };
    const fetcher = vi.fn(async (path: string) => {
      if (path === '/api/v1/auth/session') return jsonResponse(200, { signedIn });
      if (path === '/api/v1/me') return jsonResponse(signedIn ? 200 : 401, signedIn ? profile : undefined);
      if (path === '/api/v1/auth/csrf') return jsonResponse(200, { headerName: 'X-XSRF-TOKEN', token: 'csrf' });
      if (path === '/api/v1/auth/login') {
        signedIn = true;
        return jsonResponse(200, profile);
      }
      if (path === '/api/v1/me/saved-sets/1') return jsonResponse(200, reviewer);
      if (path === '/api/v1/me/saved-sets/1/cards') {
        return jsonResponse(200, {
          deck: { id: '1', title: reviewer.title, cardCount: 5, archived: false },
          items: [],
          dueCardIds: [],
          nextCursor: null,
        });
      }
      if (path === '/api/v1/me/saved-sets/keys') return jsonResponse(200, []);
      if (path === '/api/v1/public-sets/catalog/subjects') {
        return jsonResponse(200, [{ subject: 'Biology', topicCount: 1 }]);
      }
      if (path === '/api/v1/public-sets?published=true&limit=100&subject=Biology&q=cell') {
        return jsonResponse(200, [{ ...historySet, title: 'Cell Biology', subject: 'Biology' }]);
      }
      return jsonResponse(404);
    });
    vi.stubGlobal('fetch', fetcher);

    const { router } = renderApp(destination);
    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(fetcher.mock.calls.some(([path]) => path.startsWith('/api/v1/me/saved-sets'))).toBe(false);
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe(destination);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: profile.username } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: crypto.randomUUID() } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByRole('heading', { level: 1, name: heading });
    expect(router.state.location.pathname + router.state.location.search).toBe(destination);
    if (heading === 'Biology') expect(await screen.findByRole('link', { name: 'Open Cell Biology' })).toBeDefined();
  });

  it('scrolls an old desktop guide link after the session check mounts its section', async () => {
    // A guest in a browser that was signed in before: the homepage waits, so the section mounts late.
    saveSignedInHint(true);
    const session = pendingSession();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      renderApp('/#how-it-works');
      expect(scroll).not.toHaveBeenCalled();
      await session.finish(false);
      const title = await screen.findByRole('heading', { name: 'How spaced repetition works' });
      expect(scroll.mock.instances).toContain(title.closest('section'));
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('retains confirmed public navigation through a failed recheck and updates after confirmed sign-out', async () => {
    const session = pendingSession();
    renderApp('/sets');
    await session.finish(true);
    await screen.findByRole('link', { name: 'Account' });
    const respond = session.fetcher.getMockImplementation()!;
    let finish!: (value: Response) => void;
    session.fetcher.mockImplementation((path) =>
      path === '/api/v1/auth/session'
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : respond(path),
    );
    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => expect(finish).toBeDefined());
      expect(screen.getByRole('link', { name: 'Account' })).toBeDefined();
      await act(async () => finish(jsonResponse(503)));
      expect(screen.getByRole('link', { name: 'Account' })).toBeDefined();
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await act(async () => finish(jsonResponse(200, { signedIn: false })));
      expect(await screen.findByRole('link', { name: 'Sign in' })).toBeDefined();
      expect(screen.queryByRole('link', { name: 'Account' })).toBeNull();
    } finally {
      focusManager.setFocused(undefined);
    }
  });
});
