import type { TrialCards, PublicContentReader, PublicSet } from '../application/publicContent';

export const httpPublicContent: PublicContentReader = {
  list: async (after) => {
    const path = after ? `/api/v1/public-sets?after=${encodeURIComponent(after)}` : '/api/v1/public-sets';
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
    return { items: (await response.json()) as PublicSet[], nextCursor: response.headers.get('X-Next-Cursor') };
  },
  sharedSummary: (code) => getJsonOrNull<PublicSet>(`/api/v1/public-sets/share/${encodeURIComponent(code)}/summary`),
  summary: (key) => getJsonOrNull<PublicSet>(`/api/v1/public-sets/${encodeURIComponent(key)}`),
  trialCards: (key) => getJsonOrNull<TrialCards>(`/api/v1/public-sets/${encodeURIComponent(key)}/demo-cards`),
};

async function getJsonOrNull<T>(path: string): Promise<T | null> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  return (await response.json()) as T;
}
