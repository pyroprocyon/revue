import {
  PublicCatalogBusy,
  type TrialCards,
  type PublicContentReader,
  type PublicSet,
  type ReviewerSubject,
} from '../application/publicContent';
import { sameOriginRequest } from '../../../shared/http/sameOriginRequest';

export const httpPublicContent: PublicContentReader = {
  async topics(subject, search, after, signal) {
    const params = new URLSearchParams({ published: 'true', limit: '100', subject });
    if (search) params.set('q', search);
    if (after) params.set('after', after);
    const response = await readCatalog(`/api/v1/public-sets?${params}`, signal);
    return { items: (await response.json()) as PublicSet[], nextCursor: response.headers.get('X-Next-Cursor') };
  },
  async subjects(signal) {
    const response = await readCatalog('/api/v1/public-sets/catalog/subjects', signal);
    return response.json() as Promise<ReviewerSubject[]>;
  },
  async onboarding(signal) {
    const response = await readCatalog('/api/v1/public-sets/catalog/onboarding', signal);
    return response.json() as Promise<PublicSet[]>;
  },
  sharedSummary: (code) => getJsonOrNull<PublicSet>(`/api/v1/public-sets/share/${encodeURIComponent(code)}/summary`),
  summary: (key) => getJsonOrNull<PublicSet>(`/api/v1/public-sets/${encodeURIComponent(key)}`),
  trialCards: (key) =>
    getJsonOrNull<TrialCards>(`/api/v1/public-sets/${encodeURIComponent(key)}/demo-cards`, 'no-cache'),
};

async function readCatalog(path: string, signal: AbortSignal) {
  const response = await sameOriginRequest(path, { headers: { Accept: 'application/json' }, signal });
  if (response.status === 503) throw new PublicCatalogBusy();
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  return response;
}

async function getJsonOrNull<T>(path: string, cache: RequestCache = 'no-store'): Promise<T | null> {
  const response = await sameOriginRequest(path, { headers: { Accept: 'application/json' }, cache });
  if (response.status === 404) return null;
  if (response.status === 503) throw new PublicCatalogBusy();
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  return (await response.json()) as T;
}
