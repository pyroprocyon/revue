import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountGateway } from '../application/account';

beforeEach(() => {
  vi.resetModules();
});

const generatedPassword = crypto.randomUUID();

function csrfAnswer() {
  return Response.json({ token: 'synthetic-csrf', headerName: 'X-XSRF-TOKEN' });
}

function answerWhoseBodyStalls() {
  const body = new ReadableStream({
    start(controller) {
      controller.error(new DOMException('signal timed out', 'TimeoutError'));
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('account connection recovery', () => {
  it('gives retry guidance when the first CSRF request fails and succeeds after reconnecting', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ token: 'synthetic-csrf', headerName: 'X-XSRF-TOKEN' }))
      .mockResolvedValueOnce(Response.json({ username: 'student' }));
    vi.stubGlobal('fetch', request);
    const { httpAccount } = await import('./httpAccount');
    await expect(httpAccount.signIn('student', 'kanjii')).rejects.toThrow('Check your connection');
    await expect(httpAccount.signIn('student', 'kanjii')).resolves.toEqual({ username: 'student' });
  });

  it('gives the same guidance when sign-in times out, and sends each request with a timeout', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: 'synthetic-csrf', headerName: 'X-XSRF-TOKEN' }))
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
    vi.stubGlobal('fetch', request);
    const { httpAccount } = await import('./httpAccount');
    await expect(httpAccount.signIn('student', 'kanjii')).rejects.toThrow('Check your connection');
    for (const [, init] of request.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['sign-in', (account: AccountGateway) => account.signIn('student', generatedPassword)],
    [
      'registration',
      (account: AccountGateway) =>
        account.register({ username: 'student', password: generatedPassword, invitation: 'synthetic' }),
    ],
  ])('gives the same guidance when the %s answer stalls after its headers arrive', async (_, submit) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(csrfAnswer()).mockResolvedValueOnce(answerWhoseBodyStalls()));
    const { httpAccount } = await import('./httpAccount');
    await expect(submit(httpAccount)).rejects.toThrow('Check your connection');
  });

  it('asks for a new CSRF token after sign-in, because sign-in replaces it', async () => {
    const tokens = ['guest-token', 'account-token'];
    const fetcher = vi.fn(async (path: string, _init?: { headers?: Record<string, string> }) => {
      if (path === '/api/v1/auth/csrf') return Response.json({ token: tokens.shift(), headerName: 'X-XSRF-TOKEN' });
      if (path === '/api/v1/auth/login') return Response.json({ username: 'student' });
      return new Response();
    });
    vi.stubGlobal('fetch', fetcher);
    const { httpAccount } = await import('./httpAccount');
    const { sameOriginWrite } = await import('../../../shared/http/sameOriginRequest');

    await httpAccount.signIn('student', generatedPassword);
    await sameOriginWrite('/api/v1/decks', { method: 'POST' });

    const sent = fetcher.mock.calls.filter(([path]) => path !== '/api/v1/auth/csrf');
    expect(sent.map(([, init]) => init?.headers?.['X-XSRF-TOKEN'])).toEqual(['guest-token', 'account-token']);
  });

  it('accepts the empty answer to sign-out', async () => {
    const signedOut = new Response(null, { status: 204 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(csrfAnswer()).mockResolvedValueOnce(signedOut));
    const { httpAccount } = await import('./httpAccount');
    await expect(httpAccount.signOut()).resolves.toBeUndefined();
  });
});
