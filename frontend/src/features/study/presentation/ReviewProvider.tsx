import { createContext, useContext, useId, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router';
import type { ReviewGateway } from '../application/reviews';

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

/** A sent rating makes the cached Today summary out of date, even when its response never arrives. */
export function useForgetTodayQueue() {
  const queryClient = useQueryClient();
  const { username } = useOutletContext<{ username: string }>();
  return () => queryClient.removeQueries({ queryKey: todayQueueKey(username), exact: true });
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
    refetchOnMount: 'always',
  });
}
