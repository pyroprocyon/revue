import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountGateway, AccountProfile } from '../application/account';
import { announceSessionChange } from '../../../shared/navigation/sessionChanges';
import { sameOriginWrite } from '../../../shared/http/sameOriginRequest';
import { pendingLoginKey } from '../../../shared/cache/queryKeys';
import { AccountProvider } from './AccountProvider';
import { AccountLayout } from './AccountLayout';
import { AccountPage } from './AccountPage';

function setup(
  draft = false,
  current = vi.fn().mockResolvedValue({ username: 'first_student' }),
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const gateway: AccountGateway = {
    prepareWrite: vi.fn(),
    signedIn: vi.fn().mockResolvedValue(false),
    current,
    register: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
  const view = render(
    <QueryClientProvider client={client}>
      <AccountProvider gateway={gateway}>
        <MemoryRouter initialEntries={['/account']}>
          <Routes>
            <Route element={<AccountLayout />}>
              <Route path="/library" element={<h1>Library</h1>} />
              <Route path="/account" element={draft ? <Draft /> : <AccountPage />} />
            </Route>
            <Route path="/sign-in" element={<h1>Sign in again</h1>} />
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
  return { gateway, client, ...view };
}

/** A future editor must retain same-account input, but never carry it into another account. */
function Draft() {
  const profile = useOutletContext<AccountProfile>();
  const [value, setValue] = useState('');
  return (
    <>
      <h1>{profile.username}</h1>
      <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />
    </>
  );
}

function deferredProfile() {
  let resolve!: (value: AccountProfile | null) => void;
  const promise = new Promise<AccountProfile | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => vi.restoreAllMocks());

function returnAfterWindowExpires() {
  const later = Date.now() + 30_000;
  vi.spyOn(Date, 'now').mockReturnValue(later);
  returnToWindow();
}

function returnToWindow() {
  fireEvent.blur(window);
  fireEvent.focus(window);
}

function blurAsChromiumDoesInsideInertContent(element: HTMLElement) {
  element.blur();
}

describe('signed-in layout', () => {
  it('shows an initial failure and retries without mounting private content early', async () => {
    const current = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ username: 'first_student' });
    setup(false, current);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Your account' });
  });

  it('waits for the session before mounting private content and reports only a slow wait', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferredProfile();
      setup(false, vi.fn().mockReturnValue(pending.promise));
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.getByRole('status').textContent).toBe('Loading your account…');
      await act(async () => {
        pending.resolve({ username: 'first_student' });
      });
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['first_student', 'other_student', null])(
    'accepts a tab tap during recheck only for the same learner (%s)',
    async (username) => {
      const { gateway } = setup();
      await screen.findByRole('heading', { name: 'Your account' });
      const pending = deferredProfile();
      vi.mocked(gateway.current).mockReturnValueOnce(pending.promise);
      returnAfterWindowExpires();
      const tab = screen.getByRole('link', { name: 'Library' });
      expect(tab.closest('[inert]')).toBeNull();
      fireEvent.click(tab);
      expect(screen.queryByRole('heading', { name: 'Library' })).toBeNull();
      await act(async () => pending.resolve(username === null ? null : { username }));
      const title = username === null ? 'Sign in again' : username === 'first_student' ? 'Library' : 'Your account';
      await screen.findByRole('heading', { name: title });
    },
  );

  it('opens the tab tapped during the initial check without loading the original page', async () => {
    const pending = deferredProfile();
    const { gateway } = setup(false, vi.fn().mockReturnValue(pending.promise));
    const library = screen.getByRole('link', { name: 'Library' });
    fireEvent.click(library);
    expect(screen.queryByRole('heading', { name: 'Library' })).toBeNull();
    await act(async () => pending.resolve({ username: 'first_student' }));
    await screen.findByRole('heading', { name: 'Library' });
    expect(gateway.current).toHaveBeenCalledTimes(1);
  });

  it('keeps the pending tab and shares one ongoing check across brief background switches', async () => {
    const { gateway } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    const pending = deferredProfile();
    vi.mocked(gateway.current).mockReturnValueOnce(pending.promise);
    returnAfterWindowExpires();
    fireEvent.click(screen.getByRole('link', { name: 'Library' }));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent.blur(window);
    fireEvent(document, new Event('visibilitychange'));
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    fireEvent.focus(window);
    returnToWindow();
    expect(gateway.current).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve({ username: 'first_student' }));
    await screen.findByRole('heading', { name: 'Library' });
  });

  it('defers the initial request in a background tab until it becomes visible', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      const { gateway } = setup();
      expect(gateway.current).not.toHaveBeenCalled();
      visibility.mockReturnValue('visible');
      fireEvent(document, new Event('visibilitychange'));
      await screen.findByRole('heading', { name: 'Your account' });
      fireEvent.focus(window);
      expect(gateway.current).toHaveBeenCalledTimes(1);
    } finally {
      visibility.mockRestore();
    }
  });

  it('skips quick returns until exactly 30 seconds after a successful check', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100_000);
    const { gateway } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    for (const time of [101_000, 115_000, 129_999]) {
      now.mockReturnValue(time);
      returnToWindow();
      expect(gateway.current).toHaveBeenCalledTimes(1);
    }
    now.mockReturnValue(130_000);
    returnToWindow();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' }).closest('[inert]')).toBeNull());
    expect(gateway.current).toHaveBeenCalledTimes(2);
    now.mockReturnValue(159_999);
    returnToWindow();
    expect(gateway.current).toHaveBeenCalledTimes(2);
  });

  it('rechecks on a quick return when the session changed while the tab was suspended', async () => {
    const { gateway, client } = setup(true);
    const draft = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Draft' });
    fireEvent.change(draft, { target: { value: 'Private notes' } });
    client.setQueryData(['private-library'], ['private']);
    vi.mocked(gateway.current).mockResolvedValueOnce({ username: 'second_student' });
    fireEvent.blur(window);
    announceSessionChange();
    fireEvent.focus(window);
    await screen.findByRole('heading', { name: 'second_student' });
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveProperty('value', '');
    expect(client.getQueryData(['private-library'])).toBeUndefined();
    expect(gateway.current).toHaveBeenCalledTimes(2);
  });

  it('checks again after a long absence even if another tab triggered a successful check in the background', async () => {
    const { gateway } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    announceSessionChange();
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(gateway.current).toHaveBeenCalledTimes(2);
    vi.mocked(gateway.current).mockResolvedValueOnce(null);
    visibility.mockReturnValue('visible');
    const later = Date.now() + 30_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    fireEvent(document, new Event('visibilitychange'));
    await screen.findByRole('heading', { name: 'Sign in again' });
  });

  it('checks every return when session changes cannot be read from storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable');
    });
    const { gateway } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    returnToWindow();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' }).closest('[inert]')).toBeNull());
    expect(gateway.current).toHaveBeenCalledTimes(2);
  });

  it('checks once per real return even if a later focus or visibility event arrives after the request completes', async () => {
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    try {
      const { gateway } = setup();
      await screen.findByRole('heading', { name: 'Your account' });
      fireEvent.focus(window);
      fireEvent(document, new Event('visibilitychange'));
      expect(gateway.current).toHaveBeenCalledTimes(1);
      returnAfterWindowExpires();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' }).closest('[inert]')).toBeNull());
      fireEvent(document, new Event('visibilitychange'));
      fireEvent.focus(window);
      expect(gateway.current).toHaveBeenCalledTimes(2);
    } finally {
      focus.mockRestore();
    }
  });

  it('pauses account actions after a failed session check until retry succeeds', async () => {
    const { gateway } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    vi.mocked(gateway.current).mockRejectedValueOnce(new Error('offline'));
    returnAfterWindowExpires();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Sign out' }).closest('[inert]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' }).closest('[inert]')).toBeNull());
  });

  it('preserves drafts through session checks and a failed check followed by retry', async () => {
    const { gateway } = setup(true);
    const input = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Draft' });
    fireEvent.change(input, { target: { value: 'An unfinished question' } });
    input.focus();
    input.setSelectionRange(3, 8);
    const pending = deferredProfile();
    vi.mocked(gateway.current).mockReturnValueOnce(pending.promise);
    returnAfterWindowExpires();
    fireEvent(document, new Event('visibilitychange'));
    expect(gateway.current).toHaveBeenCalledTimes(2);
    expect(input.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    blurAsChromiumDoesInsideInertContent(input);
    await act(async () => {
      pending.resolve({ username: 'first_student' });
    });
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
    expect(input.value).toBe('An unfinished question');
    vi.mocked(gateway.current).mockRejectedValueOnce(new Error('offline'));
    returnAfterWindowExpires();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(input.closest('[inert]')).toBeNull());
    expect(input.value).toBe('An unfinished question');
  });

  it('clears prior account state and drafts when the confirmed account changes', async () => {
    const { gateway, client } = setup(true);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Draft' }), { target: { value: 'Private draft' } });
    client.setQueryData(['private-library'], ['first account data']);
    vi.mocked(gateway.current).mockResolvedValueOnce({ username: 'second_student' });
    returnAfterWindowExpires();
    await screen.findByRole('heading', { name: 'second_student' });
    expect((screen.getByRole('textbox', { name: 'Draft' }) as HTMLInputElement).value).toBe('');
    expect(client.getQueryData(['private-library'])).toBeUndefined();
  });

  it.each([
    { rejection: 'the server rejects the earlier session’s token', tokenFor: 'first_student', writesSent: 1 },
    { rejection: 'a fresh token names the learner who signed in elsewhere', tokenFor: 'second_student', writesSent: 0 },
  ])('rechecks when $rejection, so another learner never inherits the draft', async ({ tokenFor, writesSent }) => {
    const { gateway } = setup(true);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Draft' }), {
      target: { value: 'First learner’s deck' },
    });
    const beforeOtherSignIn = deferredProfile();
    vi.mocked(gateway.current)
      .mockReturnValueOnce(beforeOtherSignIn.promise)
      .mockResolvedValueOnce({ username: 'second_student' });
    returnAfterWindowExpires();
    const fetcher = vi.fn(async (path: string) => {
      if (path === '/api/v1/auth/csrf')
        return Response.json({ token: `${tokenFor}-token`, headerName: 'X-XSRF-TOKEN', username: tokenFor });
      if (path === '/api/v1/auth/session') return Response.json({ signedIn: true });
      return new Response(null, { status: tokenFor === 'first_student' ? 403 : 201 });
    });
    vi.stubGlobal('fetch', fetcher);

    await act(() => sameOriginWrite('/api/v1/decks', { method: 'POST' }));
    await screen.findByRole('heading', { name: 'second_student' });
    await act(async () => {
      beforeOtherSignIn.resolve({ username: 'first_student' });
    });

    expect(screen.getByRole('heading', { name: 'second_student' })).toBeDefined();
    expect((screen.getByRole('textbox', { name: 'Draft' }) as HTMLInputElement).value).toBe('');
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/v1/decks')).toHaveLength(writesSent);
  });

  it('rechecks after a long background stay and ignores the old in-flight response', async () => {
    const { gateway, client } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    client.setQueryData(['private-library'], ['private']);
    const previous = deferredProfile();
    vi.mocked(gateway.current).mockReturnValueOnce(previous.promise).mockResolvedValueOnce(null);
    returnAfterWindowExpires();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      fireEvent(document, new Event('visibilitychange'));
      const later = Date.now() + 30_000;
      vi.spyOn(Date, 'now').mockReturnValue(later);
      visibility.mockReturnValue('visible');
      fireEvent(document, new Event('visibilitychange'));
    } finally {
      visibility.mockRestore();
    }
    await screen.findByRole('heading', { name: 'Sign in again' });
    await act(async () => {
      previous.resolve({ username: 'first_student' });
    });
    expect(screen.queryByRole('heading', { name: 'Your account' })).toBeNull();
    expect(client.getQueryData(['private-library'])).toBeUndefined();
  });

  it.each([
    { answer: { username: 'second_student' }, lands: 'second_student' },
    { answer: null, lands: 'Sign in again' },
  ])('discards pending login reads when verification answers $lands', async ({ answer, lands }) => {
    const client = new QueryClient();
    client.setQueryData(pendingLoginKey, 'first_student');
    client.setQueryData(['private-library'], ['first account data']);
    const pending = deferredProfile();
    setup(true, vi.fn().mockReturnValue(pending.promise), client);
    expect(screen.queryByRole('textbox', { name: 'Draft' })).toBeNull();
    await act(async () => pending.resolve(answer));
    await screen.findByRole('heading', { name: lands });
    expect(client.getQueryData(['private-library'])).toBeUndefined();
    expect(client.getQueryData(pendingLoginKey)).toBeUndefined();
  });

  it('reopens from the last confirmed account at once, keeps its cache and rechecks with controls paused', async () => {
    const first = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    first.client.setQueryData(['private-library'], ['private']);
    first.unmount();

    const pending = deferredProfile();
    setup(false, vi.fn().mockReturnValue(pending.promise), first.client);
    const heading = screen.getByRole('heading', { name: 'Your account' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' }).closest('[inert]')).not.toBeNull();
    blurAsChromiumDoesInsideInertContent(heading);
    await act(async () => {
      pending.resolve({ username: 'first_student' });
    });
    expect(screen.getByRole('button', { name: 'Sign out' }).closest('[inert]')).toBeNull();
    expect(document.activeElement).toBe(heading);
    expect(first.client.getQueryData(['private-library'])).toEqual(['private']);
  });

  it.each([
    { answer: { username: 'second_student' }, lands: 'second_student' },
    { answer: null, lands: 'Sign in again' },
  ])('drops the remembered account and its cache when the recheck answers $lands', async ({ answer, lands }) => {
    const first = setup(true);
    await screen.findByRole('heading', { name: 'first_student' });
    first.client.setQueryData(['private-library'], ['first account data']);
    first.unmount();

    setup(true, vi.fn().mockResolvedValue(answer), first.client);
    await screen.findByRole('heading', { name: lands });
    expect(screen.queryByRole('heading', { name: 'first_student' })).toBeNull();
    expect(first.client.getQueryData(['private-library'])).toBeUndefined();
  });

  it('keeps sign-out failure visible and clears cached data only after confirmed sign-out', async () => {
    const { gateway, client } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    client.setQueryData(['private-library'], ['private']);
    vi.mocked(gateway.signOut).mockRejectedValueOnce(new Error('offline'));
    const trigger = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(trigger);
    const dialog = () => within(screen.getByRole('dialog', { name: 'Sign out of Revue?' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Stay signed in' }));
    expect(gateway.signOut).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(dialog().getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('alert');
    expect(client.getQueryData(['private-library'])).toEqual(['private']);
    fireEvent.click(dialog().getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in again' });
    expect(client.getQueryData(['private-library'])).toBeUndefined();
  });

  it('follows the browser when it closes a pending sign-out, and Sign out opens again after a failure', async () => {
    const { gateway } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    let failSignOut!: (reason: Error) => void;
    vi.mocked(gateway.signOut).mockReturnValueOnce(
      new Promise<void>((_, reject) => {
        failSignOut = reject;
      }),
    );
    const trigger = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Sign out of Revue?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog', { name: 'Sign out of Revue?' })).toBe(dialog);
    fireEvent(dialog, new Event('cancel', { cancelable: false }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async () => {
      failSignOut(new Error('offline'));
    });
    fireEvent.click(trigger);
    const reopened = within(screen.getByRole('dialog', { name: 'Sign out of Revue?' }));
    expect(reopened.getByRole('button', { name: 'Sign out' })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides the sign-out confirmation during a session check and shows it again for the same account', async () => {
    const { gateway } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('dialog', { name: 'Sign out of Revue?' })).toBeDefined();
    const pending = deferredProfile();
    vi.mocked(gateway.current).mockReturnValueOnce(pending.promise);
    returnAfterWindowExpires();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => {
      pending.resolve({ username: 'first_student' });
    });
    expect(screen.getByRole('dialog', { name: 'Sign out of Revue?' })).toBeDefined();
    expect(gateway.signOut).not.toHaveBeenCalled();
  });
});
