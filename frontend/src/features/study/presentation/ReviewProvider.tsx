import { createContext, useContext, useId, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router';
import type { RatingRequest, ReviewGateway } from '../application/reviews';

const ReviewContext = createContext<ReviewGateway | null>(null);
export function ReviewProvider({ gateway, children }: Readonly<{ gateway: ReviewGateway; children: ReactNode }>) {
  return <ReviewContext value={gateway}>{children}</ReviewContext>;
}
export function useReviewGateway() {
  const gateway = useContext(ReviewContext);
  if (!gateway) throw new Error('ReviewProvider is missing');
  return gateway;
}

function todayQueueKey(username: string) {
  return ['reviews', username, 'today'];
}

/** Today's summary stays cached per learner. A return visit shows it at once and refreshes it. */
export function useTodayQueue() {
  const gateway = useReviewGateway();
  const { username } = useOutletContext<{ username: string }>();
  return useQuery({
    queryKey: todayQueueKey(username),
    queryFn: () => gateway.queue(),
    retry: false,
    networkMode: 'always',
    refetchOnMount: 'always',
  });
}

/** Refreshes Today after a sent rating settles, including when the learner already left the batch. */
export function useSubmitRating() {
  const gateway = useReviewGateway();
  const queryClient = useQueryClient();
  const { username } = useOutletContext<{ username: string }>();
  return async (cardId: string, input: RatingRequest) => {
    const today = { queryKey: todayQueueKey(username), exact: true };
    queryClient.removeQueries(today);
    try {
      return await gateway.rate(cardId, input);
    } finally {
      // A visit to Today may have started a read before this rating committed.
      await queryClient.cancelQueries(today);
      void queryClient.invalidateQueries(today);
    }
  };
}

/** A review batch always starts from its own fresh queue. A later visit never reuses it. */
export function useBatchQueue() {
  const gateway = useReviewGateway();
  const visit = useId();
  const { username } = useOutletContext<{ username: string }>();
  return useQuery({
    queryKey: ['reviews', username, 'batch', visit],
    queryFn: () => gateway.queue(),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
