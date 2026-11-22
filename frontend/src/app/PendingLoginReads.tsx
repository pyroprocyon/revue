import { matchPath, useLocation } from 'react-router';
import { useDecks, usePrefetchDeckCards } from '../features/catalog/presentation/useDecks';
import { useSavedSets } from '../features/catalog/presentation/useSavedSets';
import { pausedReview } from '../features/study/presentation/pausedReview';
import { useTodayQueueFor } from '../features/study/presentation/ReviewProvider';
import { DECK_ROUTE, LIBRARY_PATH, NEW_DECK_PATH, TODAY_PATH } from '../shared/navigation/paths';

export function PendingLoginReads({ username }: Readonly<{ username: string }>) {
  const { pathname } = useLocation();
  if (pathname === TODAY_PATH) return <TodayRead username={username} />;
  if (pathname === LIBRARY_PATH) return <LibraryReads username={username} />;
  const deckId = matchPath(DECK_ROUTE, pathname)?.params.deckId;
  return deckId && pathname !== NEW_DECK_PATH ? <DeckRead username={username} deckId={deckId} /> : null;
}

function TodayRead({ username }: Readonly<{ username: string }>) {
  useTodayQueueFor(username, undefined, true, pausedReview(username) ?? undefined);
  return null;
}

function LibraryReads({ username }: Readonly<{ username: string }>) {
  useDecks(username, true);
  useSavedSets(username);
  return null;
}

function DeckRead({ username, deckId }: Readonly<{ username: string; deckId: string }>) {
  usePrefetchDeckCards(username, deckId);
  return null;
}
