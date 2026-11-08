import { queryOptions } from '@tanstack/react-query';

// The public, read-only endpoints behind the set list, each set's preview and its trial (plan
// section 10). A set that isn't offered answers 404, which these queries return as null.

export type PublicSet = {
  setKey: string;
  title: string;
  description: string;
  publisherName: string;
  cardCount: number;
  trialAvailable: boolean;
};

/** A flashcard: the question on the front, the answer and its optional note and source on the back. */
export type DemoCard = {
  key: string;
  question: string;
  answer: string;
  /** A short note under the answer, when the card's author wrote one. */
  explanation: string | null;
  source: string | null;
};

export type DemoCards = {
  setTitle: string;
  publisherName: string;
  cards: DemoCard[];
};

export const publicSetsQuery = queryOptions({
  queryKey: ['public-sets'],
  queryFn: async () => (await getJsonOrNull<PublicSet[]>('/api/v1/public-sets')) ?? [],
});

export function publicSetQuery(setKey: string) {
  return queryOptions({
    queryKey: ['public-sets', setKey],
    queryFn: () => getJsonOrNull<PublicSet>(`/api/v1/public-sets/${encodeURIComponent(setKey)}`),
  });
}

export function demoCardsQuery(setKey: string) {
  return queryOptions({
    queryKey: ['public-sets', setKey, 'demo-cards'],
    queryFn: () => getJsonOrNull<DemoCards>(`/api/v1/public-sets/${encodeURIComponent(setKey)}/demo-cards`),
  });
}

async function getJsonOrNull<T>(path: string): Promise<T | null> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET ${path} answered ${response.status}`);
  }
  return (await response.json()) as T;
}
