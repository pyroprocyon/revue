import { describe, expect, it, vi } from 'vitest';
import { sameOriginRequest } from './sameOriginRequest';

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
});
