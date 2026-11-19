import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  DeckFailure,
  type DeckCard,
  type DeckCardPage,
  type DeckCardQuery,
  type DeckFailureReason,
} from '../application/decks';
import { useDeckGateway } from './DeckProvider';
import { deckKeys, reviewKeys } from '../../../shared/cache/queryKeys';

export function useDecks(username: string, enabled: boolean) {
  const gateway = useDeckGateway();
  return useQuery({ queryKey: deckKeys.list(username), queryFn: () => gateway.list(), enabled, retry: false });
}

export function useDeckCards(username: string, deckId: string, query: DeckCardQuery) {
  const gateway = useDeckGateway();
  return useInfiniteQuery({
    queryKey: deckKeys.cardPage(username, deckId, query),
    initialPageParam: query.after,
    queryFn: async ({ pageParam, signal }) => ({
      ...(await gateway.cards(deckId, { ...query, after: pageParam }, signal)),
      search: query.search ?? '',
    }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
}

type CachedCardPage = DeckCardPage & { search: string };
export type CardPages = InfiniteData<CachedCardPage, string | undefined>;

export function updateDeckPages(
  client: QueryClient,
  key: readonly unknown[],
  update: (page: CachedCardPage) => CachedCardPage,
) {
  client.setQueriesData<CardPages>(
    { queryKey: key },
    (cached) => cached && { ...cached, pages: cached.pages.map(update) },
  );
}

export function matchesCardSearch(card: DeckCard, term: string) {
  const search = term.toLowerCase();
  return card.question.toLowerCase().includes(search) || card.answer.toLowerCase().includes(search);
}

export async function updateCachedCards(
  client: QueryClient,
  queryKey: readonly unknown[],
  cardId: string,
  edited?: DeckCard,
) {
  await client.cancelQueries({ queryKey });
  if (edited) {
    updateDeckPages(client, queryKey, (page) => {
      const current = page.items.find((card) => card.id === cardId);
      if (!current || current.contentVersion > edited.contentVersion) return page;
      const items = matchesCardSearch(edited, page.search)
        ? page.items.map((card) => (card.id === cardId ? edited : card))
        : page.items.filter((card) => card.id !== cardId);
      return { ...page, items };
    });
    return;
  }
  client.setQueriesData<CardPages>({ queryKey }, (cached) => {
    if (!cached?.pages.some((page) => page.items.some((card) => card.id === cardId))) return cached;
    const pages = cached.pages.map((page) => ({
      ...page,
      deck: { ...page.deck, cardCount: page.deck.cardCount - 1 },
      items: page.items.filter((card) => card.id !== cardId),
      dueCardIds: page.dueCardIds.filter((id) => id !== cardId),
    }));
    return { ...cached, pages };
  });
}

export type DeckWriteState = { status: 'idle' | 'saving' } | { status: 'failed'; reason: DeckFailureReason };

/**
 * Runs one deck or card change at a time and reports success only after the server confirms it.
 * Decks decide Today's cards, so every attempt also discards Today's cached summary.
 */
export function useDeckWrite() {
  const client = useQueryClient();
  const [state, setState] = useState<DeckWriteState>({ status: 'idle' });
  const busy = useRef(false);

  async function run<T>(write: () => Promise<T>, onConfirmed: (result: T) => void | Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setState({ status: 'saving' });
    try {
      const result = await write();
      await onConfirmed(result);
      refreshDecks();
      setState({ status: 'idle' });
    } catch (error) {
      const reason = error instanceof DeckFailure ? error.reason : 'unknown';
      if (reason === 'signed-out') client.clear();
      else refreshDecks();
      setState({ status: 'failed', reason });
    } finally {
      busy.current = false;
    }
  }

  function refreshDecks() {
    void client.invalidateQueries({ queryKey: deckKeys.all });
    client.removeQueries({ queryKey: reviewKeys.all });
  }

  return {
    state,
    saving: state.status === 'saving',
    run,
    clearProblem: () => setState({ status: 'idle' }),
  };
}
