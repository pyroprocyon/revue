import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountGateway } from '../application/account';
import { AccountProvider } from './AccountProvider';
import { AccountForm } from './AccountForm';

const testPassword = crypto.randomUUID().slice(0, 6);

function setup(register = true, entry = '/register') {
  const gateway: AccountGateway = {
    register: vi.fn().mockResolvedValue({ username: 'student' }),
    signIn: vi.fn().mockResolvedValue({ username: 'student' }),
    signOut: vi.fn().mockResolvedValue(undefined), current: vi.fn().mockResolvedValue(null),
  };
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[entry]}>
    <AccountProvider gateway={gateway}><Routes>
      <Route path="/register" element={<AccountForm register={register} />} />
      <Route path="/sign-in" element={<AccountForm />} />
      <Route path="/sets/example" element={<p>Original set</p>} />
      <Route path="/account" element={<p>Account ready</p>} />
    </Routes></AccountProvider>
  </MemoryRouter></QueryClientProvider>);
  return gateway;
}

beforeEach(() => { window.history.replaceState({}, '', '/register'); });

describe('pilot account forms', () => {
  it.each([8, 22])('accepts a %i-character invitation and removes its fragment before registration', async (length) => {
    const invitation = 'a'.repeat(length);
    window.history.replaceState({}, '', `/i#${invitation}`);
    const gateway = setup();
    fireEvent.change(screen.getByRole('textbox', { name: /^Username/ }), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: testPassword } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: testPassword } });
    fireEvent.click(screen.getByRole('checkbox', { name: /at least 18/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /privacy notice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(gateway.register).toHaveBeenCalledWith({
      username: 'student', password: testPassword, invitation, adult: true, privacy: true,
    }));
    expect(window.location.hash).toBe('');
  });

  it('registers with a six-character password, clears the invitation fragment and navigates on confirmation', async () => {
    const invite = 'a'.repeat(43);
    window.history.replaceState({}, '', `/register#invite=${invite}`);
    const gateway = setup();
    const username = screen.getByRole('textbox', { name: /Username/ });
    const password = screen.getByLabelText(/^Password/);
    expect(username.getAttribute('autocomplete')).toBe('username');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
    fireEvent.change(username, { target: { value: 'student' } });
    fireEvent.change(password, { target: { value: testPassword } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: testPassword } });
    fireEvent.click(screen.getByRole('checkbox', { name: /at least 18/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /privacy notice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Account ready');
    expect(gateway.register).toHaveBeenCalledWith({ username: 'student', password: testPassword, invitation: invite, adult: true, privacy: true });
    expect(window.location.hash).toBe('');
  });

  it.each([false, true])('consumes a newly arriving invitation without resetting the form (initial invitation: %s)', async (alreadyInvited) => {
    if (alreadyInvited) window.history.replaceState({}, '', `/register#invite=${'a'.repeat(43)}`);
    const gateway = setup(true, '/register?returnTo=%2Fsets%2Fexample');
    fireEvent.change(screen.getByRole('textbox', { name: /Username/ }), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: testPassword } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: testPassword } });
    const invitation = 'b'.repeat(43);
    const history = { keep: 'existing history state' };
    window.history.replaceState(history, '', `/register?returnTo=%2Fsets%2Fexample#invite=${invitation}`);
    fireEvent(window, new HashChangeEvent('hashchange'));
    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(window.location.search).toBe('?returnTo=%2Fsets%2Fexample');
    expect(window.history.state).toEqual(history);
    expect((screen.getByRole('textbox', { name: /Username/ }) as HTMLInputElement).value).toBe('student');
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe(testPassword);
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: /at least 18/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /privacy notice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Original set');
    expect(gateway.register).toHaveBeenCalledWith({ username: 'student', password: testPassword, invitation, adult: true, privacy: true });
  });

  it('opens policy notices separately so reading them keeps the invitation form mounted', () => {
    window.history.replaceState({}, '', `/register#invite=${'a'.repeat(43)}`);
    setup();
    const policies = screen.getByRole('navigation', { name: 'Help and policies' });
    for (const link of policies.querySelectorAll('a[href^="/"]')) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noreferrer');
      expect(link.textContent).toContain('opens in a new tab');
    }
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('needs an invitation but never asks for email', () => {
    setup();
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('invitation link');
  });

  it.each([false, true])('preserves the set when switching to sign-in (invited: %s)', async (invited) => {
    if (invited) window.history.replaceState({}, '', `/register#invite=${'a'.repeat(43)}`);
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
    const invitation = 'a'.repeat(8);
    window.history.replaceState({}, '', `/i#${invitation}`);
    const gateway = setup();
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    const confirmation = screen.getByLabelText('Confirm password') as HTMLInputElement;
    expect(confirmation.autocomplete).toBe('new-password');
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'student' } });
    fireEvent.change(password, { target: { value: testPassword } });
    fireEvent.change(confirmation, { target: { value: testPassword + 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /at least 18/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /privacy notice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(gateway.register).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toBe('Passwords don’t match.');
    expect(password.value).toBe(testPassword);
    expect(confirmation.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(confirmation, { target: { value: testPassword } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Account ready');
    expect(gateway.register).toHaveBeenCalledExactlyOnceWith({ username: 'student', password: testPassword, invitation, adult: true, privacy: true });
  });

  it('clears both signup passwords after a server rejection while preserving the username', async () => {
    window.history.replaceState({}, '', `/i#${'a'.repeat(8)}`);
    const gateway = setup();
    vi.mocked(gateway.register).mockRejectedValue(new Error('Please try again.'));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: testPassword } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: testPassword } });
    fireEvent.click(screen.getByRole('checkbox', { name: /at least 18/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /privacy notice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Confirm password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('student');
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
