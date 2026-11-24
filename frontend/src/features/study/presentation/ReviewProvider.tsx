import { createContext, useContext, useId, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router';
import { ReviewFailure, type RatingRequest, type ReviewGateway, type ReviewSelection } from '../application/reviews';
import { untilNextStudyDay } from '../../../shared/product/studyRules';
import { deckKeys, pendingLoginKey, reviewKeys } from '../../../shared/cache/queryKeys';

const ReviewContext = createContext<ReviewGateway | null>(null);
export function ReviewProvider({ gateway, children }: Readonly<{ gateway: ReviewGateway; children: ReactNode }>) {
  return <ReviewContext value={gateway}>{children}</ReviewContext>;
}
export function useReviewGateway() {
  const gateway = useContext(ReviewContext);
  if (!gateway) throw new Error('ReviewProvider is missing');
  return gateway;
}

function todayKey(username: string, selection?: ReviewSelection, pausedTopic?: string) {
  if (selection) return reviewKeys.topic(username, selection.topic, selection.includeNew);
  const today = reviewKeys.today(username);
  return pausedTopic ? [...today, 'paused', pausedTopic] : today;
}

/** Today's summary stays cached per learner. A return visit shows it at once and refreshes it. */
export function useTodayQueue(selection?: ReviewSelection, enabled = true, pausedTopic?: string) {
  const { username } = useOutletContext<{ username: string }>();
  return useTodayQueueFor(username, selection, enabled, pausedTopic);
}

export function useTodayQueueFor(username: string, selection?: ReviewSelection, enabled = true, pausedTopic?: string) {
  const gateway = useReviewGateway();
  const client = useQueryClient();
  return useQuery({
    queryKey: todayKey(username, selection, pausedTopic),
    queryFn: () => gateway.queue(selection, true, pausedTopic),
    enabled,
    retry: false,
    networkMode: 'always',
    refetchOnMount: client.getQueryData(pendingLoginKey) === username ? false : 'always',
    refetchInterval: untilNextStudyDay,
  });
}

function sessionExpired(error: Error | null) {
  return error instanceof ReviewFailure && error.kind === 'signed-out';
}

export function useTodayOverview(pausedTopic: string | null) {
  const query = useTodayQueue(undefined, true, pausedTopic ?? undefined);
  const needsFallback = pausedTopic !== null && query.isError && !sessionExpired(query.error);
  const fallback = useTodayQueue(undefined, needsFallback);
  return {
    query,
    overview: query.data ?? (needsFallback ? fallback.data : undefined),
    loading: query.isPending || (needsFallback && fallback.isPending),
    signedOut: sessionExpired(query.error) || (needsFallback && sessionExpired(fallback.error)),
  };
}

/** Refreshes Today and deck progress after a sent rating settles, including when the learner already left the batch. */
export function useSubmitRating() {
  const gateway = useReviewGateway();
  const queryClient = useQueryClient();
  const { username } = useOutletContext<{ username: string }>();
  return async (cardId: string, input: RatingRequest) => {
    const today = { queryKey: reviewKeys.today(username) };
    const deckPages = { queryKey: deckKeys.allCardPages(username) };
    queryClient.removeQueries(today);
    try {
      return await gateway.rate(cardId, input);
    } finally {
      // A visit to Today or a deck may have started a read before this rating committed.
      await Promise.all([queryClient.cancelQueries(today), queryClient.cancelQueries(deckPages)]);
      void queryClient.invalidateQueries(today);
      void queryClient.invalidateQueries(deckPages);
    }
  };
}

/** A review batch always starts from its own fresh queue. A later visit never reuses it. */
export function useBatchQueue(selection: ReviewSelection) {
  const gateway = useReviewGateway();
  const visit = useId();
  const { username } = useOutletContext<{ username: string }>();
  return useQuery({
    queryKey: reviewKeys.batch(username, visit),
    queryFn: () => gateway.queue(selection),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
