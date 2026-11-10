import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); });

describe('account connection recovery', () => {
  it('gives retry guidance when the first CSRF request fails and succeeds after reconnecting', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json({ token: 'synthetic-csrf', headerName: 'X-XSRF-TOKEN' }))
      .mockResolvedValueOnce(Response.json({ username: 'student' }));
    vi.stubGlobal('fetch', request);
    const { httpAccount } = await import('./httpAccount');
    await expect(httpAccount.signIn('student', 'kanjii')).rejects.toThrow('Check your connection');
    await expect(httpAccount.signIn('student', 'kanjii')).resolves.toEqual({ username: 'student' });
  });
});
