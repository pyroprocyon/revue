import { useQuery } from '@tanstack/react-query';
import { useLibraryGateway } from './LibraryProvider';

/** Keeps paginated Library reads scoped to the signed-in learner. */
export function useSavedSets(username: string, after?: string) {
  const gateway = useLibraryGateway();
  return useQuery({
    queryKey: ['library', 'list', username, after],
    queryFn: () => gateway.list(after),
    retry: false,
  });
}
