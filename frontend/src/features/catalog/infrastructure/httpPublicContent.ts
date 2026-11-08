import type { DemoCards, PublicContentReader, PublicSet } from '../application/publicContent';

export const httpPublicContent: PublicContentReader = {
  list: async () => (await getJsonOrNull<PublicSet[]>('/api/v1/public-sets')) ?? [],
  summary: (key) => getJsonOrNull<PublicSet>(`/api/v1/public-sets/${encodeURIComponent(key)}`),
  demoCards: (key) => getJsonOrNull<DemoCards>(`/api/v1/public-sets/${encodeURIComponent(key)}/demo-cards`),
};

async function getJsonOrNull<T>(path: string): Promise<T | null> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  return (await response.json()) as T;
}
