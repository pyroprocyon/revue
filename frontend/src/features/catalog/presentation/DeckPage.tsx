import { useQueryClient } from '@tanstack/react-query';
import { LIBRARY_PATH } from '../../../shared/navigation/paths';
import { deckKeys } from '../../../shared/cache/queryKeys';
import { routeState } from '../../../shared/navigation/routeState';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router';
import type { AccountProfile } from '../../account/application/account';
import { SessionExpiredRedirect } from '../../../shared/navigation/SessionExpiredRedirect';
import { DeckFailure, type Deck } from '../application/decks';
import { useHasUnsavedDeckChanges } from './UnsavedDeckChanges';
import { MoreCards } from './MoreCards';
import { DueFilter } from './DueFilter';
import { useDeckCards, type CardPages } from './useDecks';
import { usePageCursor } from '../../../shared/navigation/usePageCursor';
import { pageModule } from '../../../shared/navigation/usePageModule';
import { PageControls } from '../../../shared/ui/PageControls';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { LoadingPlaceholder, LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { DECKS_UNAVAILABLE_TEXT, decksUnavailable } from './decksUnavailable';

const { usePageModule: useDeckContent, preload: preloadDeckContent } = pageModule(() =>
  import('./DeckContent').then(({ DeckContent }) => DeckContent),
);

export { preloadDeckContent };

export function DeckPage() {
  const profile = useOutletContext<AccountProfile>();
  const location = useLocation();
  const { deckId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { cursor: after, previousPage, nextPage } = usePageCursor();
  const term = params.get('q')?.trim() ?? '';
  const dueOnly = params.get('due') === '1';
  const cards = useDeckCards(profile.username, deckId, { after, search: term, dueOnly });
  const client = useQueryClient();
  const editor = useDeckContent();
  const navigate = useNavigate();
  const [importNotice] = useState(() => importedCardsNotice(routeState(location).importedCards));
  // Browsers keep history state across reloads and Back, so the import is confirmed only on arrival.
  useEffect(() => {
    if (routeState(location).importedCards === undefined) return;
    void navigate(location, { replace: true, state: { ...routeState(location), importedCards: undefined } });
  }, [location, navigate]);
  const hasDrafts = useHasUnsavedDeckChanges();
  const search = useCallback(
    (value: string, replace = false) => {
      if (value !== term) setParams(firstPageWith(params, 'q', value), { replace });
    },
    [params, setParams, term],
  );
  const showDue = (value: boolean) => setParams(firstPageWith(params, 'due', value ? '1' : ''));
  if (cards.error instanceof DeckFailure && cards.error.reason === 'signed-out') {
    return <SessionExpiredRedirect returnTo={LIBRARY_PATH} />;
  }
  const deckIsGone = cards.error instanceof DeckFailure && cards.error.reason === 'not-found';
  const page =
    cards.data?.pages[0] ??
    client
      .getQueriesData<CardPages>({ queryKey: deckKeys.cardPages(profile.username, deckId) })
      .find(([, cached]) => cached)?.[1]?.pages[0];
  const deck = page?.deck;
  const onEarlier = after === undefined ? undefined : previousPage;
  const canShowCards = page && deck && (!deckIsGone || hasDrafts);
  const feedback = (
    <DeckLoadFeedback
      cards={cards}
      term={term}
      deckIsGone={deckIsGone}
      inline={Boolean(canShowCards && editor)}
      waitingForEditor={Boolean(canShowCards && !editor)}
    />
  );

  if (canShowCards && editor) {
    if ('error' in editor) throw editor.error;
    const DeckContent = editor.component;
    const filter = (dueOnly || (!deck.archived && page.progress.dueCards > 0)) && (
      <DueFilter dueOnly={dueOnly} onChange={showDue} />
    );
    return (
      <DeckContent
        key={`${profile.username}:${deckId}`}
        username={profile.username}
        justCreated={routeState(location).createdDeck === true}
        arrivalNotice={importNotice}
        deck={deck}
        progress={page.progress}
        {...loadedCards(deck, cards.data?.pages)}
        refreshing={cards.isFetching}
        dueOnly={dueOnly}
        filter={filter}
        unavailable={deckIsGone}
        view={params.toString()}
        term={term}
        onSearch={search}
        feedback={feedback}
        moreCards={<MoreCards key={params.toString()} cards={cards} onEarlier={onEarlier} />}
        pagination={deckPagination(onEarlier, cards.data?.pages.at(-1)?.nextCursor, nextPage)}
      />
    );
  }
  const summary = cards.isPending
    ? client.getQueryData<Deck[]>(deckKeys.list(profile.username))?.find((item) => item.id === deckId)
    : undefined;
  return (
    <WorkspacePage
      title={deck?.title ?? summary?.title ?? 'Deck'}
      subtitle={(cards.isPending || (canShowCards && !editor)) && <span aria-hidden="true" className="block min-h-6" />}
      aboveTitle={
        <NavigationLink
          to={LIBRARY_PATH}
          back
          aria-label="Back to Library"
          className="workspace-page-back -mt-2 -ml-2 mb-1"
        >
          Library
        </NavigationLink>
      }
    >
      {feedback}
    </WorkspacePage>
  );
}

function importedCardsNotice(importedCards: number | undefined) {
  return importedCards === undefined ? null : `${cardCountLabel(importedCards)} imported.`;
}

function loadedCards(deck: Deck, pages: CardPages['pages'] | undefined) {
  return {
    items: pages?.flatMap((batch) => batch.items),
    dueCardIds: deck.archived ? [] : (pages?.flatMap((batch) => batch.dueCardIds) ?? []),
  };
}

function deckPagination(
  onPrevious: (() => void) | undefined,
  nextCursor: string | null | undefined,
  nextPage: (cursor: string) => void,
) {
  if (!onPrevious && !nextCursor) return null;
  return (
    <PageControls
      label="Deck pages"
      compact
      className=""
      onPrevious={onPrevious}
      onNext={nextCursor ? () => nextPage(nextCursor) : undefined}
    />
  );
}

function firstPageWith(params: URLSearchParams, name: string, value: string) {
  const updated = new URLSearchParams(params);
  if (value) updated.set(name, value);
  else updated.delete(name);
  updated.delete('after');
  return updated;
}

function DeckLoadFeedback({
  cards,
  term,
  deckIsGone,
  inline,
  waitingForEditor,
}: Readonly<{
  cards: ReturnType<typeof useDeckCards>;
  term: string;
  deckIsGone: boolean;
  inline: boolean;
  waitingForEditor: boolean;
}>) {
  if (cards.isPending || waitingForEditor) {
    const loadingLabel = term ? 'Searching cards…' : 'Loading your deck…';
    return (
      <WhenSlow>
        {inline ? (
          <LoadingStatus>{loadingLabel}</LoadingStatus>
        ) : (
          <LoadingPlaceholder kind="deck">{loadingLabel}</LoadingPlaceholder>
        )}
      </WhenSlow>
    );
  }
  if (!cards.isError || (cards.isFetchNextPageError && !deckIsGone)) return null;
  let message = 'Your deck couldn’t load. Check your connection and try again.';
  if (deckIsGone) message = 'This deck isn’t in your Library.';
  else if (decksUnavailable(cards.error)) message = DECKS_UNAVAILABLE_TEXT;
  else if (cards.data) message = 'Couldn’t refresh this deck. The cards below may be out of date.';
  else if (term) message = 'Search couldn’t load. Check your connection and try again.';
  return (
    <div className="mb-4">
      <p role="alert" className="mb-4 text-muted">
        {message}
      </p>
      {!deckIsGone && (
        <button
          type="button"
          className={primaryButton}
          onClick={() => void cards.refetch()}
          disabled={cards.isFetching}
        >
          {cards.isFetching ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </div>
  );
}
