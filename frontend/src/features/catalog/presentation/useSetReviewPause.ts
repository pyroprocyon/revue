import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LibraryFailure, type LibraryPage, type SavedSet } from '../application/library';
import { libraryKeys, reviewKeys } from '../../../shared/cache/queryKeys';
import { useLibraryGateway } from './LibraryProvider';
import { updateDeckPages } from './useDecks';

export function useSetReviewPause(username: string, set: SavedSet) {
  const client = useQueryClient();
  const gateway = useLibraryGateway();
  const lists = { queryKey: libraryKeys.listsOf(username) };
  const pages = { queryKey: libraryKeys.cardPages(username, set.id) };
  const detail = { queryKey: libraryKeys.detail(username, set.id) };
  const today = { queryKey: reviewKeys.today(username) };

  return useMutation({
    mutationFn: (paused: boolean) => gateway.setReviewsPaused(set.id, paused),
    networkMode: 'always',
    async onSettled(_, error, paused) {
      if (error instanceof LibraryFailure && error.reason === 'signed-out') {
        client.clear();
        return;
      }
      await Promise.all([
        client.cancelQueries(lists),
        client.cancelQueries(pages),
        client.cancelQueries(detail),
        client.cancelQueries(today),
      ]);
      if (!error) {
        client.setQueriesData<LibraryPage>(
          lists,
          (page) =>
            page && {
              ...page,
              items: page.items.map((item) => (item.id === set.id ? { ...item, reviewsPaused: paused } : item)),
            },
        );
        client.setQueryData<SavedSet>(detail.queryKey, (current) => ({ ...(current ?? set), reviewsPaused: paused }));
        updateDeckPages(client, pages.queryKey, (page) => ({ ...page, deck: { ...page.deck, archived: paused } }));
      }
      client.removeQueries({ ...today, type: 'inactive' });
      void client.invalidateQueries(today);
      void client.invalidateQueries(lists);
      void client.invalidateQueries(detail);
      void client.invalidateQueries(pages);
    },
  });
}

export function setReviewPauseProblem(error: Error): string {
  if (error instanceof LibraryFailure) {
    if (error.reason === 'unavailable') return 'This reviewer is no longer in your Library.';
    if (error.reason === 'expired-form') return 'Your form expired. Please try again.';
  }
  return 'We couldn’t confirm the change. Check your connection, then check this page before trying again.';
}
