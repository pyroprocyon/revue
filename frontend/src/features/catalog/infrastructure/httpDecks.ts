import { DeckFailure, type Deck, type DeckCard, type DeckCardPage, type DeckGateway } from '../application/decks';
import {
  answeredByOlderServer,
  isOutdatedPageRefusal,
  prepareCsrfToken,
  sameOriginRequest,
  sameOriginWrite,
} from '../../../shared/http/sameOriginRequest';

const CONFLICT_REASONS = {
  DECK_LIMIT: 'deck-limit',
  CARD_LIMIT: 'card-limit',
  STALE_CARD: 'stale-card',
  CREATE_CONFLICT: 'create-conflict',
} as const;

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await sameOriginRequest(path, init);
  if (await answeredByOlderServer(response)) throw new DeckFailure('outdated');
  return checked(response);
}

async function checked(response: Response): Promise<Response> {
  if (isOutdatedPageRefusal(response)) throw new DeckFailure('outdated');
  if (response.status === 401) throw new DeckFailure('signed-out');
  if (response.status === 403) throw new DeckFailure('expired-form');
  if (response.status === 404) throw new DeckFailure('not-found');
  if (response.status === 422) throw new DeckFailure('invalid');
  if (response.status === 409) {
    const problem = (await response.json()) as { reason?: keyof typeof CONFLICT_REASONS };
    throw new DeckFailure((problem.reason && CONFLICT_REASONS[problem.reason]) ?? 'unknown');
  }
  if (!response.ok) throw new DeckFailure('unknown');
  return response;
}

/** A lost connection leaves the result unknown, never assumed. */
async function write(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT',
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  try {
    const response = await sameOriginWrite(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return await checked(response);
  } catch (error) {
    if (error instanceof DeckFailure) throw error;
    throw new DeckFailure('unknown');
  }
}

async function confirmed<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new DeckFailure('unknown');
  }
}

export const httpDecks: DeckGateway = {
  prepareWrite: prepareCsrfToken,
  async list() {
    const response = await request('/api/v1/decks');
    return ((await response.json()) as { items: Deck[] }).items;
  },
  async create(title, requestId) {
    return confirmed<Deck>(await write('/api/v1/decks', 'POST', { title }, { 'Idempotency-Key': requestId }));
  },
  async rename(deckId, title) {
    return confirmed<Deck>(await write(`/api/v1/decks/${encodeURIComponent(deckId)}`, 'PATCH', { title }));
  },
  async setArchived(deckId, archived) {
    await write(`/api/v1/decks/${encodeURIComponent(deckId)}/archive`, archived ? 'PUT' : 'DELETE');
  },
  async remove(deckId) {
    await write(`/api/v1/decks/${encodeURIComponent(deckId)}`, 'DELETE');
  },
  async cards(deckId, { after, search, dueOnly }, signal) {
    const params = new URLSearchParams();
    if (after) params.set('after', after);
    if (search) params.set('q', search);
    if (dueOnly) params.set('due', 'true');
    const suffix = params.size ? `?${params.toString()}` : '';
    const response = await request(`/api/v1/decks/${encodeURIComponent(deckId)}/cards${suffix}`, { signal });
    return response.json() as Promise<DeckCardPage>;
  },
  async addCard(deckId, draft, requestId) {
    return confirmed<DeckCard>(
      await write(`/api/v1/decks/${encodeURIComponent(deckId)}/cards`, 'POST', draft, { 'Idempotency-Key': requestId }),
    );
  },
  async editCard(cardId, draft, expectedVersion) {
    return confirmed<DeckCard>(
      await write(`/api/v1/cards/${encodeURIComponent(cardId)}`, 'PATCH', draft, {
        'X-Content-Version': String(expectedVersion),
      }),
    );
  },
  async removeCard(cardId) {
    await write(`/api/v1/cards/${encodeURIComponent(cardId)}`, 'DELETE');
  },
};
