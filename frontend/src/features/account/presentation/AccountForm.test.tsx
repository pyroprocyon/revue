import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AccountGateway } from '../application/account';
import { httpAccount } from '../infrastructure/httpAccount';
import { AccountProvider } from './AccountProvider';
import { AccountForm } from './AccountForm';

const testPassword = crypto.randomUUID().slice(0, 6);

function setup(register = true, entry = '/register') {
  const gateway: AccountGateway = {
    prepareWrite: vi.fn(),
    signedIn: vi.fn().mockResolvedValue(false),
    register: vi.fn().mockResolvedValue({ username: 'student' }),
    signIn: vi.fn().mockResolvedValue({ username: 'student' }),
    signOut: vi.fn().mockResolvedValue(undefined),
    current: vi.fn().mockResolvedValue(null),
    studySettings: vi.fn().mockResolvedValue({ dailyNewCardLimit: 10 }),
    saveStudySettings: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <AccountProvider gateway={gateway}>
          <Routes>
            <Route path="/register" element={<AccountForm register={register} />} />
            <Route path="/sign-in" element={<AccountForm />} />
            <Route path="/sets/example" element={<p>Original set</p>} />
            <Route path="/today" element={<p>Today ready</p>} />
          </Routes>
        </AccountProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return gateway;
}

describe('pilot account forms', () => {
  it('registers with a six-character password and navigates on confirmation', async () => {
    const gateway = setup();
    const username = screen.getByRole('textbox', { name: /Username/ });
    const password = screen.getByLabelText(/^Password/);
    expect(username.getAttribute('autocomplete')).toBe('username');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
    fireEvent.change(username, { target: { value: 'student' } });
    fireEvent.change(password, { target: { value: testPassword } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: testPassword } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Today ready');
    expect(gateway.register).toHaveBeenCalledWith({ username: 'student', password: testPassword });
  });

  it('opens policy notices separately so reading them keeps the signup form mounted', () => {
    setup();
    const policies = screen.getByRole('navigation', { name: 'Help and policies' });
    for (const link of policies.querySelectorAll('a[href^="/"]')) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noreferrer');
      expect(link.textContent).toContain('opens in a new tab');
    }
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('enables direct signup without asking for email', () => {
    setup();
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
  });

  it('preserves the set when switching to sign-in', async () => {
    const gateway = setup(true, '/register?returnTo=%2Fsets%2Fexample');
    const links = screen.getAllByRole('link', { name: 'Sign in' });
    for (const link of links) expect(link.getAttribute('href')).toBe('/sign-in?returnTo=%2Fsets%2Fexample');
    fireEvent.click(links[0]);
    fireEvent.change(screen.getByRole('textbox', { name: /Username/ }), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: testPassword } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Original set');
    expect(gateway.signIn).toHaveBeenCalledWith('student', testPassword);
  });

  it('keeps mismatched signup passwords local and allows correction without re-entering the first password', async () => {
    const gateway = setup();
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    const confirmation = screen.getByLabelText('Confirm password') as HTMLInputElement;
    expect(confirmation.autocomplete).toBe('new-password');
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'student' } });
    fireEvent.change(password, { target: { value: testPassword } });
    fireEvent.change(confirmation, { target: { value: testPassword + 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(gateway.register).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toBe('Passwords don’t match.');
    expect(password.value).toBe(testPassword);
    expect(confirmation.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(confirmation, { target: { value: testPassword } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Today ready');
    expect(gateway.register).toHaveBeenCalledExactlyOnceWith({
      username: 'student',
      password: testPassword,
    });
  });

  it('clears both signup passwords after a server rejection while preserving the username', async () => {
    const gateway = setup();
    vi.mocked(gateway.register).mockRejectedValue(new Error('Please try again.'));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: testPassword } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: testPassword } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Confirm password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('student');
  });

  it.each([
    ['a 60-second delay', 60, false, 0],
    ['a 30-day delay', 2_592_000, false, 0],
    ['an HTTP date', 60, true, 0],
    ['a 60-second delay after the clock moves back an hour', 60, false, -3_600_000],
    ['a 60-second delay after the clock moves forward an hour', 60, false, 3_600_000],
    ['a 30-day delay after the clock moves forward a week', 2_592_000, false, 604_800_000],
  ])('keeps signup entries and honors %s on a confirmed 429', async (_, seconds, useHttpDate, clockShiftMs) => {
    vi.useFakeTimers({ now: new Date(2026, 10, 27, 9) });
    try {
      const gateway = setup(true, '/register?returnTo=%2Fsets%2Fexample');
      const retryAt = new Date(Date.now() + seconds * 1000);
      const retryAfter = useHttpDate ? retryAt.toUTCString() : String(seconds);
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ token: 'form-token', headerName: 'X-XSRF-TOKEN' }))
        .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': retryAfter } }))
        .mockResolvedValueOnce(Response.json({ username: 'student' }));
      vi.stubGlobal('fetch', fetcher);
      vi.mocked(gateway.register).mockImplementation(httpAccount.register);
      const username = screen.getByLabelText('Username') as HTMLInputElement;
      const password = screen.getByLabelText('Password') as HTMLInputElement;
      const confirmation = screen.getByLabelText('Confirm password') as HTMLInputElement;
      fireEvent.change(username, { target: { value: 'student' } });
      fireEvent.change(password, { target: { value: testPassword } });
      fireEvent.change(confirmation, { target: { value: testPassword } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      });

      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBe('Signup is busy. Your entries are still here.');
      expect(username.value).toBe('student');
      expect(password.value).toBe(testPassword);
      expect(confirmation.value).toBe(testPassword);
      const initialWait = seconds === 60 ? '60 seconds' : '30 days';
      const submit = screen.getByRole('button', { name: `Try again in ${initialWait}` }) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      fireEvent.submit(submit.form as HTMLFormElement);
      if (clockShiftMs !== 0) vi.setSystemTime(Date.now() + clockShiftMs);
      await act(() => vi.advanceTimersByTimeAsync(55_000));
      const remainingWait = seconds === 60 ? '5 seconds' : '30 days';
      expect(submit.textContent).toBe(`Try again in ${remainingWait}`);
      expect(alert.textContent).toBe('Signup is busy. Your entries are still here.');
      expect(submit.disabled).toBe(true);
      await act(() => vi.advanceTimersByTimeAsync(seconds * 1000 - 55_001));
      expect(submit.disabled).toBe(true);
      expect(submit.textContent).toBe('Try again in 1 second');
      expect(gateway.register).toHaveBeenCalledTimes(1);

      username.focus();
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(screen.getByRole('alert').textContent).toContain('You can try again now');
      expect(document.activeElement).toBe(username);
      expect(submit.disabled).toBe(false);
      expect(gateway.register).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      });
      expect(screen.getByText('Original set')).toBeTruthy();
      expect(gateway.register).toHaveBeenNthCalledWith(2, { username: 'student', password: testPassword });
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a current-password field and clears it after a rejected sign-in', async () => {
    const gateway = setup(false);
    vi.mocked(gateway.signIn).mockRejectedValue(new Error('Username or password is incorrect'));
    const password = screen.getByLabelText(/^Password/) as HTMLInputElement;
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(screen.queryByLabelText('Confirm password')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: /Username/ }), { target: { value: 'student' } });
    fireEvent.change(password, { target: { value: testPassword } });
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.type).toBe('text');
    expect(password.value).toBe(testPassword);
    expect(gateway.signIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.type).toBe('password');
    expect(password.value).toBe(testPassword);
    expect(gateway.signIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(password.value).toBe(''));
    expect(screen.getByRole('alert').textContent).toBe('Username or password is incorrect');
    expect(document.activeElement).toBe(screen.getByRole('alert'));
  });
});
