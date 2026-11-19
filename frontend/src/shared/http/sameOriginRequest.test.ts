import { describe, expect, it, vi } from 'vitest';
import {
  bindWritesTo,
  csrfToken,
  forgetCsrfToken,
  onOutdatedPage,
  onSessionMismatch,
  prepareCsrfToken,
  sameOriginRequest,
  sameOriginWrite,
} from './sameOriginRequest';

const tokenAnswer = (token: string) => Response.json({ token, headerName: 'X-XSRF-TOKEN' });
const tokenRequests = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.filter(([path]) => path === '/api/v1/auth/csrf').length;
const sentTokens = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.filter(([path]) => path === '/api/v1/example').map(([, init]) => init.headers['X-XSRF-TOKEN']);

describe('same-origin requests', () => {
  it('gives every request a timeout, the session cookie and an uncached answer', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetcher);

    await sameOriginRequest('/api/v1/example', { method: 'POST' });

    const [path, init] = fetcher.mock.calls[0];
    expect(path).toBe('/api/v1/example');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('combines caller cancellation with the request timeout', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetcher);
    const cancellation = new AbortController();
    const timeout = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    try {
      await sameOriginRequest('/api/v1/example', { signal: cancellation.signal });
      const first = fetcher.mock.calls[0][1].signal as AbortSignal;
      cancellation.abort();
      expect(first.aborted).toBe(true);
      await sameOriginRequest('/api/v1/example', { signal: new AbortController().signal });
      const second = fetcher.mock.calls[1][1].signal as AbortSignal;
      timeout.abort();
      expect(second.aborted).toBe(true);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('shares a pending form token with immediate submissions and later writes', async () => {
    const fetcher = vi.fn(async (path: string, _init?: { headers?: Record<string, string> }) =>
      path === '/api/v1/auth/csrf' ? tokenAnswer('first') : new Response(),
    );
    vi.stubGlobal('fetch', fetcher);

    prepareCsrfToken();
    expect(tokenRequests(fetcher)).toBe(1);
    await Promise.all([
      sameOriginWrite('/api/v1/example', { method: 'POST', headers: { 'Content-Type': 'application/json' } }),
      sameOriginWrite('/api/v1/example', { method: 'POST' }),
    ]);
    await sameOriginWrite('/api/v1/example', { method: 'DELETE' });

    expect(tokenRequests(fetcher)).toBe(1);
    expect(sentTokens(fetcher)).toEqual(['first', 'first', 'first']);
    expect(fetcher.mock.calls[1][1]?.headers?.['Content-Type']).toBe('application/json');
  });

  it('never resends a rejected write, reports the mismatch, and the next write fetches a new token', async () => {
    const tokens = ['previous-session', 'current-session'];
    const fetcher = vi.fn(async (path: string, init: { headers?: Record<string, string> }) => {
      if (path === '/api/v1/auth/csrf') return tokenAnswer(tokens.shift()!);
      if (path === '/api/v1/auth/session') return Response.json({ signedIn: true });
      return new Response(null, { status: init.headers?.['X-XSRF-TOKEN'] === 'current-session' ? 200 : 403 });
    });
    vi.stubGlobal('fetch', fetcher);
    const mismatch = vi.fn();
    const stopHearing = onSessionMismatch(mismatch);

    try {
      const rejected = await sameOriginWrite('/api/v1/example', { method: 'POST' });
      expect(sentTokens(fetcher)).toEqual(['previous-session']);
      expect(mismatch).toHaveBeenCalledTimes(1);
      const next = await sameOriginWrite('/api/v1/example', { method: 'POST' });

      expect([rejected.status, next.status]).toEqual([403, 200]);
      expect(sentTokens(fetcher)).toEqual(['previous-session', 'current-session']);
      expect(mismatch).toHaveBeenCalledTimes(1);
    } finally {
      stopHearing();
    }
  });

  it('names the bound learner on private writes and no learner on unbound ones', async () => {
    const fetcher = vi.fn(async (path: string, _init?: { headers?: Record<string, string> }) =>
      path === '/api/v1/auth/csrf'
        ? Response.json({ token: 'first-session', headerName: 'X-XSRF-TOKEN', username: 'first_student' })
        : new Response(),
    );
    vi.stubGlobal('fetch', fetcher);
    const learnerHeaders = () =>
      fetcher.mock.calls
        .filter(([path]) => path === '/api/v1/example')
        .map(([, init]) => init?.headers?.['X-Revue-Learner']);

    await sameOriginWrite('/api/v1/example', { method: 'POST' });
    bindWritesTo('first_student');
    await sameOriginWrite('/api/v1/example', { method: 'POST' });

    expect(learnerHeaders()).toEqual([undefined, 'first_student']);
  });

  it('never sends a private write whose token names another learner, and reports the mismatch', async () => {
    const fetcher = vi.fn(async (path: string) => {
      if (path === '/api/v1/auth/csrf')
        return Response.json({ token: 'second-session', headerName: 'X-XSRF-TOKEN', username: 'second_student' });
      if (path === '/api/v1/auth/session') return Response.json({ signedIn: true });
      return new Response();
    });
    vi.stubGlobal('fetch', fetcher);
    const mismatch = vi.fn();
    const stopHearing = onSessionMismatch(mismatch);
    bindWritesTo('first_student');

    try {
      const refused = await sameOriginWrite('/api/v1/example', { method: 'POST' });
      await sameOriginWrite('/api/v1/example', { method: 'POST' });

      expect(refused.status).toBe(403);
      expect(sentTokens(fetcher)).toEqual([]);
      expect(tokenRequests(fetcher)).toBe(2);
      expect(mismatch).toHaveBeenCalledTimes(2);
    } finally {
      stopHearing();
    }
  });

  it('refuses a private write when the previous server’s token cannot name the learner, and asks for a reload', async () => {
    const fetcher = vi.fn(async (path: string) =>
      path === '/api/v1/auth/csrf' ? tokenAnswer('older') : new Response(),
    );
    vi.stubGlobal('fetch', fetcher);
    const outdated = vi.fn();
    const mismatch = vi.fn();
    const stopHearing = [onOutdatedPage(outdated), onSessionMismatch(mismatch)];
    bindWritesTo('first_student');

    try {
      const refused = await sameOriginWrite('/api/v1/example', { method: 'POST' });

      expect(refused.status).toBe(403);
      expect(sentTokens(fetcher)).toEqual([]);
      expect(outdated).toHaveBeenCalledTimes(1);
      expect(mismatch).not.toHaveBeenCalled();
    } finally {
      stopHearing.forEach((stop) => stop());
    }
  });

  it('reports a rejected write as signed out when nobody is signed in any more', async () => {
    const fetcher = vi.fn(async (path: string) => {
      if (path === '/api/v1/auth/csrf') return tokenAnswer('expired-session');
      if (path === '/api/v1/auth/session') return Response.json({ signedIn: false });
      return new Response(null, { status: 403 });
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await sameOriginWrite('/api/v1/example', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(sentTokens(fetcher)).toEqual(['expired-session']);
  });

  it('asks again after a failed token request or after the token is forgotten', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(tokenAnswer('after-failure'))
      .mockResolvedValueOnce(tokenAnswer('after-sign-in'));
    vi.stubGlobal('fetch', fetcher);

    await expect(csrfToken()).rejects.toThrow();
    await expect(csrfToken()).resolves.toMatchObject({ token: 'after-failure' });
    forgetCsrfToken();
    await expect(csrfToken()).resolves.toMatchObject({ token: 'after-sign-in' });
  });
});
