import { queryOptions } from '@tanstack/react-query';
import type { PublicContentReader } from './publicContent';

export const publicContentKeys = {
  sets: ['public-sets'] as const,
  set: (key: string) => ['public-sets', key] as const,
  trial: (key: string) => ['public-sets', key, 'demo-cards'] as const,
};

export function publicContentQueries(reader: PublicContentReader) {
  return {
    publicSetsQuery: queryOptions({ queryKey: publicContentKeys.sets, queryFn: () => reader.list() }),
    publicSetsPageQuery: (after?: string) => queryOptions({
      queryKey: after ? [...publicContentKeys.sets, 'page', after] : publicContentKeys.sets,
      queryFn: () => reader.list(after),
    }),
    publicSetQuery: (key: string, kind: 'key' | 'share' = 'key') => queryOptions({
      queryKey: publicContentKeys.set(kind === 'share' ? `share:${key}` : key),
      queryFn: () => kind === 'share' ? reader.sharedSummary(key) : reader.summary(key),
    }),
    trialCardsQuery: (key: string) => trialCardsQuery(reader, key),
  };
}

/** Shared by catalog prefetching and the study screen, using the same cache entry. */
export function trialCardsQuery(reader: Pick<PublicContentReader, 'trialCards'>, key: string) {
  return queryOptions({
    queryKey: publicContentKeys.trial(key), queryFn: () => reader.trialCards(key),
  });
}
