import { describe, expect, it, vi } from 'vitest';
import { sharedSetId } from '../application/library';
import { httpLibrary } from './httpLibrary';
import { jsonResponse } from '../../../test/renderApp';

describe('library transport', () => {
  it('preserves full database IDs when translating short share codes', () => {
    expect(sharedSetId((9223372036854775807n).toString(36))).toBe('9223372036854775807');
    expect(() => sharedSetId('../1')).toThrow();
  });
  it('treats an aborted save as unknown and uses a fresh CSRF token', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(200, { token: 'fresh', headerName: 'X-XSRF-TOKEN' }))
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
    vi.stubGlobal('fetch', fetcher);
    await expect(httpLibrary.save('1')).rejects.toMatchObject({ reason: 'unknown' });
    expect(fetcher.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('never treats a failed membership read as an unsaved set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503)));
    await expect(httpLibrary.membership('1')).rejects.toMatchObject({ reason: 'unknown' });
  });
  it('uses a fresh CSRF token for removal and accepts an empty 204 response', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse(200, { token: 'fresh', headerName: 'X-XSRF-TOKEN' }))
      .mockResolvedValueOnce(jsonResponse(204));
    vi.stubGlobal('fetch', fetcher);
    await expect(httpLibrary.remove('1')).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenLastCalledWith('/api/v1/sets/1/save', expect.objectContaining({ method: 'DELETE', headers: { 'X-XSRF-TOKEN': 'fresh' } }));
  });
  it.each([[401, 'signed-out'], [403, 'expired-form'], [503, 'unknown']])('reports removal HTTP %i as %s', async (status, reason) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(200, { token: 'fresh', headerName: 'X-XSRF-TOKEN' }))
      .mockResolvedValueOnce(jsonResponse(status as number)));
    await expect(httpLibrary.remove('1')).rejects.toMatchObject({ reason });
  });
});
