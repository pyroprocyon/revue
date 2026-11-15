import { LibraryFailure, type LibraryGateway, type LibraryPage, type SavedSet } from '../application/library';
import { CSRF_PATH, sameOriginRequest, type CsrfToken } from '../../../shared/http/sameOriginRequest';

function check(response: Response) {
  if (response.status === 401) throw new LibraryFailure('signed-out');
  if (response.status === 403) throw new LibraryFailure('expired-form');
  if (response.status === 404) throw new LibraryFailure('unavailable');
  if (!response.ok) throw new LibraryFailure('unknown');
}

/** Both membership writes use fresh CSRF and preserve uncertainty on transport failure. */
async function writeMembership(id: string, method: 'POST' | 'DELETE'): Promise<Response> {
  try {
    const bootstrap = await sameOriginRequest(CSRF_PATH);
    check(bootstrap);
    const csrf = (await bootstrap.json()) as CsrfToken;
    const response = await sameOriginRequest(`/api/v1/sets/${id}/save`, {
      method,
      headers: { [csrf.headerName]: csrf.token },
    });
    check(response);
    return response;
  } catch (error) {
    if (error instanceof LibraryFailure) throw error;
    throw new LibraryFailure('unknown');
  }
}

export const httpLibrary: LibraryGateway = {
  async membership(id) {
    const response = await sameOriginRequest(`/api/v1/sets/${id}/save`);
    if (response.status === 401) return null;
    check(response);
    const result = (await response.json()) as { saved: boolean };
    if (typeof result.saved !== 'boolean') throw new LibraryFailure('load');
    return result.saved;
  },
  async save(id) {
    const response = await writeMembership(id, 'POST');
    try {
      return (await response.json()) as SavedSet;
    } catch {
      throw new LibraryFailure('unknown');
    }
  },
  async list(after) {
    const suffix = after ? `?after=${encodeURIComponent(after)}` : '';
    const response = await sameOriginRequest(`/api/v1/me/saved-sets${suffix}`);
    check(response);
    return response.json() as Promise<LibraryPage>;
  },
  async remove(id) {
    await writeMembership(id, 'DELETE');
  },
};
