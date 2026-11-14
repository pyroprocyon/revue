import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { focusManager } from '@tanstack/react-query';
import { historyCards, historySet } from '../test/fixtures';
import { jsonResponse, renderApp } from '../test/renderApp';
import { primaryButton, secondaryButton } from '../shared/ui/buttonStyles';

function pendingSession() {
  let resolve!: (value: Response) => void;
  const response = new Promise<Response>((done) => { resolve = done; });
  const fetcher = vi.fn(async (path: string) => {
    if (path === '/api/v1/auth/session') return response;
    if (path === '/api/v1/me') return jsonResponse(200, { username: 'learner' });
    if (path === '/api/v1/cards/due') return jsonResponse(200, {
      totalCards: 0, availableCards: 0, dueCards: 0, newCards: 0, nextReviewDate: null, cards: [],
    });
    if (path === '/api/v1/public-sets/philippine-history/demo-cards') return jsonResponse(200, historyCards);
    if (path === '/api/v1/public-sets') return jsonResponse(200, [historySet]);
    return jsonResponse(404);
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, finish: (signedIn: boolean) => act(async () => resolve(jsonResponse(200, { signedIn }))) };
}

describe('session-dependent navigation', () => {
  it.each(['/', '/sign-in', '/join', '/i', '/register'])('keeps guest content and fast loading notices off the signed-in entry %s', async (path) => {
    const session = pendingSession();
    renderApp(path);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    await session.finish(true);
    await screen.findByRole('heading', { name: 'Your review' });
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it.each([
    ['/privacy', 'Privacy notice', 'Back to sign in', 'Back to Today'],
    ['/terms', 'Terms', 'Back to sign in', 'Back to Today'],
    ['/sets', 'Shared sets', 'Sign in', 'Account'],
    ['/missing-page', 'Page not found.', 'Go to the home page', 'Go to Today'],
  ])('keeps public content readable without guessing the account action on %s', async (path, title, guestAction, accountAction) => {
    const session = pendingSession();
    renderApp(path);
    await screen.findByRole('heading', { name: title });
    expect(screen.queryByRole('link', { name: guestAction })).toBeNull();
    expect(screen.queryByRole('link', { name: accountAction })).toBeNull();
    await session.finish(true);
    expect(await screen.findByRole('link', { name: accountAction })).toBeDefined();
    expect(screen.queryByRole('link', { name: guestAction })).toBeNull();
  });

  it.each([true, false])('keeps completed trial actions neutral until the session is known (signed in: %s)', async (signedIn) => {
    const session = pendingSession();
    renderApp('/sets/philippine-history/try');
    await screen.findByRole('heading', { name: 'Question 1?' });
    for (let card = 0; card < 5; card++) {
      fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
      fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    }
    const heading = screen.getByRole('heading', { name: 'You practiced 5 cards.' });
    const another = screen.getByRole('link', { name: 'Try another set' });
    const back = screen.getByRole('link', { name: 'Back to the set' });
    expect(another.className).toBe(secondaryButton);
    expect(back.className).toBe(secondaryButton);
    await session.finish(signedIn);
    await waitFor(() => expect((signedIn ? back : another).className).toBe(primaryButton));
    expect((signedIn ? another : back).className).toBe(secondaryButton);
    expect(document.activeElement).toBe(heading);
  });

  it('scrolls an old desktop guide link after the session check mounts its section', async () => {
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
    session.fetcher.mockImplementation((path) => path === '/api/v1/auth/session'
      ? new Promise<Response>((resolve) => { finish = resolve; }) : respond(path));
    try {
      await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
      await waitFor(() => expect(finish).toBeDefined());
      expect(screen.getByRole('link', { name: 'Account' })).toBeDefined();
      await act(async () => finish(jsonResponse(503)));
      expect(screen.getByRole('link', { name: 'Account' })).toBeDefined();
      await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
      await act(async () => finish(jsonResponse(200, { signedIn: false })));
      expect(await screen.findByRole('link', { name: 'Sign in' })).toBeDefined();
      expect(screen.queryByRole('link', { name: 'Account' })).toBeNull();
    } finally {
      focusManager.setFocused(undefined);
    }
  });
});
