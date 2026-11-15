import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

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
});
