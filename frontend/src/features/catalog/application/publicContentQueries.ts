import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { PublicCatalogBusy, type PublicContentReader, type PublicSet, type TrialCards } from './publicContent';

export const publicCatalogRetry = {
  retry: (failures: number, error: Error) => {
    const cause = error instanceof PublicContentReadError ? error.cause : error;
    return cause instanceof PublicCatalogBusy && failures < 2;
  },
  retryDelay: 1_000,
};

export const publicContentKeys = {
  onboarding: ['onboarding-reviewers'] as const,
  subjects: ['published-subjects'] as const,
  topics: ['published-topics'] as const,
  set: (key: string) => ['public-sets', key] as const,
  trial: (key: string) => ['public-sets', key, 'demo-cards'] as const,
};

let readSequence = 0;

export type PublicContentRead<T> = { value: T; started: number; finished: number };

class PublicContentReadError extends Error {
  constructor(
    readonly started: number,
    cause: unknown,
  ) {
    super('Could not load public content', { cause });
  }
}

async function readPublicContent<T>(read: () => Promise<T>): Promise<PublicContentRead<T>> {
  const started = ++readSequence;
  try {
    const value = await read();
    return { value, started, finished: ++readSequence };
  } catch (error) {
    throw new PublicContentReadError(started, error);
  }
}

export function canRecheckTrial(error: Error | null, previewFinished: number) {
  return error === null || (error instanceof PublicContentReadError && error.started < previewFinished);
}

export function trialConflictsWithPreview(
  trial: PublicContentRead<TrialCards | null>,
  previewFinished: number,
  preview: Pick<PublicSet, 'trialAvailable' | 'sampleQuestion'> | null,
) {
  if (trial.started >= previewFinished) return false;
  if (!preview?.trialAvailable) return trial.value !== null;
  return (
    trial.value === null ||
    (preview.sampleQuestion !== undefined && trial.value.cards[0]?.question !== preview.sampleQuestion)
  );
}

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
        queryFn: () => readPublicContent(() => (kind === 'share' ? reader.sharedSummary(key) : reader.summary(key))),
      }),
    trialCardsQuery: (key: string) => trialCardsQuery(reader, key),
  };
}

/** Shared by catalog prefetching and the study screen, using the same cache entry. */
export function trialCardsQuery(reader: Pick<PublicContentReader, 'trialCards'>, key: string) {
  return queryOptions({
    queryKey: publicContentKeys.trial(key),
    queryFn: () => readPublicContent(() => reader.trialCards(key)),
  });
}
