import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AccountGateway, AccountProfile } from '../application/account';
import { AccountProvider } from './AccountProvider';
import { AccountLayout } from './AccountLayout';
import { AccountPage } from './AccountPage';

function setup(draft = false, current = vi.fn().mockResolvedValue({ username: 'first_student' })) {
  const gateway: AccountGateway = {
    signedIn: vi.fn().mockResolvedValue(false),
    current,
    register: vi.fn(), signIn: vi.fn(), signOut: vi.fn().mockResolvedValue(undefined),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>
    <AccountProvider gateway={gateway}><MemoryRouter initialEntries={['/account']}><Routes>
      <Route element={<AccountLayout />}>
        <Route path="/account" element={draft ? <Draft /> : <AccountPage />} />
      </Route>
      <Route path="/sign-in" element={<h1>Sign in again</h1>} />
    </Routes></MemoryRouter></AccountProvider>
  </QueryClientProvider>);
  return { gateway, client, ...view };
}

/** A future editor must retain same-account input, but never carry it into another account. */
function Draft() {
  const profile = useOutletContext<AccountProfile>();
  const [value, setValue] = useState('');
  return <><h1>{profile.username}</h1><input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} /></>;
}

function deferredProfile() {
  let resolve!: (value: AccountProfile | null) => void;
  const promise = new Promise<AccountProfile | null>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('signed-in layout', () => {
  it('shows an initial failure and retries without mounting private content early', async () => {
    const current = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ username: 'first_student' });
    setup(false, current);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Your account' });
  });

  it('waits for the session before mounting private content', async () => {
    setup();
    expect(screen.getByRole('status').textContent).toBe('Loading your account…');
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    await screen.findByRole('heading', { name: 'Your account' });
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  it('pauses account actions after a failed session check until retry succeeds', async () => {
    const { gateway } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    vi.mocked(gateway.current).mockRejectedValueOnce(new Error('offline'));
    fireEvent.focus(window);
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
    fireEvent.focus(window);
    fireEvent(document, new Event('visibilitychange'));
    expect(gateway.current).toHaveBeenCalledTimes(2);
    expect(input.closest('[inert]')).not.toBeNull();
    input.blur(); // Chromium blurs focused descendants when their parent becomes inert.
    await act(async () => { pending.resolve({ username: 'first_student' }); });
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
    expect(input.value).toBe('An unfinished question');
    vi.mocked(gateway.current).mockRejectedValueOnce(new Error('offline'));
    fireEvent.focus(window);
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
    fireEvent.focus(window);
    await screen.findByRole('heading', { name: 'second_student' });
    expect((screen.getByRole('textbox', { name: 'Draft' }) as HTMLInputElement).value).toBe('');
    expect(client.getQueryData(['private-library'])).toBeUndefined();
  });

  it('rechecks after the tab was hidden and ignores a response from before the return', async () => {
    const { gateway, client } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    client.setQueryData(['private-library'], ['private']);
    const previous = deferredProfile();
    vi.mocked(gateway.current).mockReturnValueOnce(previous.promise).mockResolvedValueOnce(null);
    fireEvent.focus(window);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      fireEvent(document, new Event('visibilitychange'));
      visibility.mockReturnValue('visible');
      fireEvent(document, new Event('visibilitychange'));
    } finally {
      visibility.mockRestore();
    }
    await screen.findByRole('heading', { name: 'Sign in again' });
    await act(async () => { previous.resolve({ username: 'first_student' }); });
    expect(screen.queryByRole('heading', { name: 'Your account' })).toBeNull();
    expect(client.getQueryData(['private-library'])).toBeUndefined();
  });

  it('keeps sign-out failure visible and clears cached data only after confirmed sign-out', async () => {
    const { gateway, client } = setup();
    await screen.findByRole('heading', { name: 'Your account' });
    client.setQueryData(['private-library'], ['private']);
    vi.mocked(gateway.signOut).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('alert');
    expect(client.getQueryData(['private-library'])).toEqual(['private']);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in again' });
    expect(client.getQueryData(['private-library'])).toBeUndefined();
  });
});
