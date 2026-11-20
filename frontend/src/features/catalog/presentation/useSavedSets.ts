import { useQuery } from '@tanstack/react-query';
import { useLibraryGateway, useListRefetchOnMount } from './LibraryProvider';
import { libraryKeys } from '../../../shared/cache/queryKeys';

/** Keeps paginated Library reads scoped to the signed-in learner. */
export function useSavedSets(username: string, after?: string) {
  const gateway = useLibraryGateway();
  const refetchOnMount = useListRefetchOnMount();
  return useQuery({
    refetchOnMount,
    queryKey: libraryKeys.page(username, after),
    queryFn: () => gateway.list(after),
    retry: false,
  });
}
