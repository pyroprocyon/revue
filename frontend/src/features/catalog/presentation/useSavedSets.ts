import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibraryPage, ReviewGroup } from '../application/library';
import { useLibraryGateway, useListRefetchOnMount } from './LibraryProvider';
import { libraryKeys } from '../../../shared/cache/queryKeys';

export function savedReviewerCardQuery(params: URLSearchParams) {
  return {
    search: params.get('cardQuery')?.trim() ?? '',
    dueOnly: params.get('cardDue') === '1',
    after: params.get('cardAfter') ?? undefined,
  };
}

/** Keeps paginated Library reads scoped to the signed-in learner. */
export function useSavedSets(username: string, after: string | undefined, group: ReviewGroup, enabled = true) {
  const gateway = useLibraryGateway();
  const refetchOnMount = useListRefetchOnMount();
  return useQuery({
    refetchOnMount,
    enabled,
    queryKey: libraryKeys.page(username, after, group),
    queryFn: () => gateway.list(after, group),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useSavedSet(username: string, id: string, enabled: boolean) {
  const gateway = useLibraryGateway();
  return useQuery({
    queryKey: libraryKeys.detail(username, id),
    queryFn: () => gateway.detail(id),
    enabled,
    retry: false,
  });
}

export function useSavedReviewerKeys(username: string) {
  const gateway = useLibraryGateway();
  const refetchOnMount = useListRefetchOnMount();
  const cache = useQueryClient().getQueryCache();
  const active = cache.find<LibraryPage>({ queryKey: libraryKeys.page(username, undefined, 'active'), exact: true });
  const paused = cache.find<LibraryPage>({ queryKey: libraryKeys.page(username, undefined, 'paused'), exact: true });
  let complete: typeof active;
  if (active && completeShelf(active.state.data, 'paused') && !refetchOnMount(active)) complete = active;
  else if (paused && completeShelf(paused.state.data, 'active') && !refetchOnMount(paused)) complete = paused;
  return useQuery({
    queryKey: libraryKeys.savedKeys(username),
    queryFn: ({ signal }) => gateway.savedKeys(signal),
    initialData: () => complete?.state.data?.items.map(({ setKey }) => setKey),
    initialDataUpdatedAt: complete?.state.dataUpdatedAt,
    refetchOnMount,
    retry: false,
  });
}

function completeShelf(page: LibraryPage | undefined, other: ReviewGroup) {
  const counts = page?.counts;
  return page?.nextCursor === null && counts?.[other] === 0 && counts.active + counts.paused === page.items.length;
}
