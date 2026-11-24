import type { DeckCardPage } from '../application/decks';
import {
  LibraryFailure,
  SAVED_SET_LIMIT,
  type LibraryGateway,
  type LibraryPage,
  type SavedSet,
} from '../application/library';
import { sameOriginRequest, sameOriginWrite } from '../../../shared/http/sameOriginRequest';

function check(response: Response) {
  if (response.status === 401) throw new LibraryFailure('signed-out');
  if (response.status === 403) throw new LibraryFailure('expired-form');
  if (response.status === 404) throw new LibraryFailure('unavailable');
  if (!response.ok) throw new LibraryFailure('unknown');
}

async function writeLibrary(path: string, method: 'POST' | 'PUT' | 'DELETE'): Promise<Response> {
  try {
    const response = await sameOriginWrite(path, { method });
    if (method === 'POST' && response.status === 409) throw new LibraryFailure('saved-set-limit');
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
    const response = await writeLibrary(`/api/v1/sets/${id}/save`, 'POST');
    try {
      return (await response.json()) as SavedSet;
    } catch {
      throw new LibraryFailure('unknown');
    }
  },
  async list(after, group, signal) {
    const params = new URLSearchParams({ limit: String(SAVED_SET_LIMIT) });
    if (after) params.set('after', after);
    if (group) params.set('paused', String(group === 'paused'));
    const response = await sameOriginRequest(`/api/v1/me/saved-sets?${params}`, { signal });
    check(response);
    return response.json() as Promise<LibraryPage>;
  },
  async detail(id) {
    const response = await sameOriginRequest(`/api/v1/me/saved-sets/${encodeURIComponent(id)}`);
    check(response);
    return response.json() as Promise<SavedSet>;
  },
  async savedKeys(signal) {
    const response = await sameOriginRequest('/api/v1/me/saved-sets/keys', { signal });
    check(response);
    return response.json() as Promise<string[]>;
  },
  async cards(setId, { after, search, dueOnly }, signal) {
    const params = new URLSearchParams();
    if (after) params.set('after', after);
    if (search) params.set('q', search);
    if (dueOnly) params.set('due', 'true');
    const suffix = params.size ? `?${params}` : '';
    const response = await sameOriginRequest(`/api/v1/me/saved-sets/${encodeURIComponent(setId)}/cards${suffix}`, {
      signal,
    });
    check(response);
    return response.json() as Promise<DeckCardPage>;
  },
  async remove(id) {
    await writeLibrary(`/api/v1/sets/${id}/save`, 'DELETE');
  },
  async setReviewsPaused(id, paused) {
    await writeLibrary(`/api/v1/me/saved-sets/${encodeURIComponent(id)}/pause`, paused ? 'PUT' : 'DELETE');
  },
};
