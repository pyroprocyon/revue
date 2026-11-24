import { usePrefetchQuery } from '@tanstack/react-query';
import { matchPath, useLocation } from 'react-router';
import { usePublicContentQueries } from '../features/catalog/presentation/PublicContentProvider';
import { useDecks, usePrefetchDeckCards } from '../features/catalog/presentation/useDecks';
import { useSavedSets } from '../features/catalog/presentation/useSavedSets';
import { pausedReview } from '../features/study/presentation/pausedReview';
import { useTodayQueueFor } from '../features/study/presentation/ReviewProvider';
import { DECK_ROUTE, LIBRARY_PATH, NEW_DECK_PATH, PUBLISHED_PATH, TODAY_PATH } from '../shared/navigation/paths';

export function PendingLoginReads({ username }: Readonly<{ username: string }>) {
  const { pathname, search } = useLocation();
  if (pathname === TODAY_PATH) return <TodayRead username={username} />;
  if (pathname === PUBLISHED_PATH) return <SubjectsRead />;
  if (pathname === LIBRARY_PATH) {
    const params = new URLSearchParams(search);
    return params.get('shelf') === 'saved' && params.has('set') ? null : (
      <LibraryReads username={username} params={params} />
    );
  }
  const deckId = matchPath(DECK_ROUTE, pathname)?.params.deckId;
  return deckId && pathname !== NEW_DECK_PATH ? <DeckRead username={username} deckId={deckId} /> : null;
}

function SubjectsRead() {
  const { publishedSubjectsQuery } = usePublicContentQueries();
  usePrefetchQuery(publishedSubjectsQuery);
  return null;
}

function TodayRead({ username }: Readonly<{ username: string }>) {
  useTodayQueueFor(username, undefined, true, pausedReview(username) ?? undefined);
  return null;
}

function LibraryReads({ username, params }: Readonly<{ username: string; params: URLSearchParams }>) {
  const after = params.get('after') ?? undefined;
  useDecks(username, after === undefined);
  useSavedSets(username, after, params.get('setStatus') === 'paused' ? 'paused' : 'active');
  return null;
}

function DeckRead({ username, deckId }: Readonly<{ username: string; deckId: string }>) {
  usePrefetchDeckCards(username, deckId);
  return null;
}
