import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { PublicCatalogBusy, type PublicContentReader } from './publicContent';

export const publicCatalogRetry = {
  retry: (failures: number, error: Error) => error instanceof PublicCatalogBusy && failures < 2,
  retryDelay: 1_000,
};

export const publicContentKeys = {
  onboarding: ['onboarding-reviewers'] as const,
  subjects: ['published-subjects'] as const,
  topics: ['published-topics'] as const,
  set: (key: string) => ['public-sets', key] as const,
  trial: (key: string) => ['public-sets', key, 'demo-cards'] as const,
};

export function publicContentQueries(reader: PublicContentReader) {
  return {
    onboardingSetsQuery: queryOptions({
      queryKey: publicContentKeys.onboarding,
      queryFn: ({ signal }) => reader.onboarding(signal),
      staleTime: 60_000,
      ...publicCatalogRetry,
    }),
    publishedSubjectsQuery: queryOptions({
      queryKey: publicContentKeys.subjects,
      queryFn: ({ signal }) => reader.subjects(signal),
      staleTime: 60_000,
      ...publicCatalogRetry,
    }),
    publishedTopicsQuery: (subject: string, search: string) =>
      infiniteQueryOptions({
        queryKey: [...publicContentKeys.topics, subject, search],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) => reader.topics(subject, search, pageParam, signal),
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        staleTime: 60_000,
        ...publicCatalogRetry,
      }),
    publicSetQuery: (key: string, kind: 'key' | 'share' = 'key') =>
      queryOptions({
        queryKey: publicContentKeys.set(kind === 'share' ? `share:${key}` : key),
        queryFn: () => (kind === 'share' ? reader.sharedSummary(key) : reader.summary(key)),
      }),
    trialCardsQuery: (key: string) => trialCardsQuery(reader, key),
  };
}

/** Shared by catalog prefetching and the study screen, using the same cache entry. */
export function trialCardsQuery(reader: Pick<PublicContentReader, 'trialCards'>, key: string) {
  return queryOptions({
    queryKey: publicContentKeys.trial(key),
    queryFn: () => reader.trialCards(key),
  });
}
