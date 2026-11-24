import { useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import type { ReviewCounts, ReviewGroup, SavedSet } from '../application/library';
import { DeckCarousel } from './DeckCarousel';
import { CollectionGrid } from './CollectionGrid';
import { CollectionSearch } from './CollectionSearch';
import { CollectionStatusMenu } from './CollectionStatusMenu';
import { LIBRARY_PATH, savedSetListParams } from '../../../shared/navigation/paths';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { routeState } from '../../../shared/navigation/routeState';
import { SavedSetBrowser } from './SavedSetBrowser';
import { savedReviewerCardQuery } from './useSavedSets';
import { useSavedSetCards } from './useDecks';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { LoadingStatus } from '../../../shared/ui/LoadingFeedback';

type Props = Readonly<{
  sets?: SavedSet[];
  detail?: SavedSet;
  linkedId?: string;
  detailFeedback?: ReactNode;
  loading: boolean;
  group: ReviewGroup;
  counts?: ReviewCounts;
  username: string;
  paginated: boolean;
  onRemoved: (title: string, focus: boolean) => void;
}>;

export function SavedSets({
  sets,
  detail,
  linkedId,
  detailFeedback,
  loading,
  group,
  counts,
  username,
  paginated,
  onRemoved,
}: Props) {
  const [params, setParams] = useSearchParams();
  const cards = useSavedSetCards(username, linkedId ?? '', savedReviewerCardQuery(params), linkedId !== undefined);
  const location = useLocation();
  const requestFocus = useContext(FocusRequestContext);
  const previousDetail = useRef<string | null>(null);
  const [opened, setOpened] = useState<string | null>(params.get('set'));
  const list = useRef<HTMLDivElement>(null);
  const term = params.get('q') ?? '';
  const groupSets = (sets ?? []).filter((set) => Boolean(set.reviewsPaused) === (group === 'paused'));
  const matches = loading ? [] : groupSets.filter((set) => set.title.toLowerCase().includes(term.trim().toLowerCase()));
  const showStatus = group === 'paused' || (counts?.paused ?? 0) > 0;
  const selected = params.get('set');
  const showing = detail?.id ?? null;
  useEffect(() => {
    const previous = previousDetail.current;
    previousDetail.current = showing;
    if (showing && selected === showing) {
      requestFocus(document.getElementById('saved-set-title'));
    } else if (previous && !showing) {
      const frame = requestAnimationFrame(() => {
        const links = list.current?.querySelectorAll<HTMLAnchorElement>('[data-library-deck]') ?? [];
        const anchor = Array.from(links).find(
          (link) => link.dataset.libraryDeck === previous && link.getClientRects().length > 0,
        );
        requestFocus(anchor ?? list.current?.querySelector<HTMLButtonElement>('[data-collection-status]') ?? null);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [showing, selected, requestFocus]);

  function setParam(key: string, value: string) {
    const next = key === 'set' ? savedSetListParams(params) : new URLSearchParams(params);
    next.set('shelf', 'saved');
    if (value) next.set(key, value);
    else next.delete(key);
    const opening = key === 'set' && Boolean(value);
    setParams(next, {
      replace: !opening,
      state: { ...routeState(location), fromSavedSetList: opening, savedCardCursors: undefined },
    });
  }
  function onOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const id = event.currentTarget.dataset.libraryDeck;
    if (!id) return;
    event.preventDefault();
    setOpened(id);
    setParam('set', id);
  }
  function chooseGroup(option: ReviewGroup) {
    if (option === group) return;
    const next = new URLSearchParams(params);
    next.set('shelf', 'saved');
    next.delete('after');
    if (option === 'active') next.delete('setStatus');
    else next.set('setStatus', option);
    setOpened(null);
    setParams(next, { replace: true });
  }
  const items = matches.map((set) => {
    const next = savedSetListParams(params);
    next.set('shelf', 'saved');
    next.set('set', set.id);
    return { ...set, archived: set.reviewsPaused, savedSetPath: `${LIBRARY_PATH}?${next}` };
  });
  const searchLabel = paginated ? 'Search reviewers on this page' : 'Search reviewers';
  const search = ((sets?.length ?? 0) > 1 || term || paginated || showStatus) && (
    <CollectionSearch
      label={searchLabel}
      placeholder={searchLabel}
      clearLabel="Clear reviewer search"
      value={term}
      onChange={(value) => setParam('q', value)}
    />
  );
  const results = items.length ? (
    <>
      <DeckCarousel
        key={`${group}:${params.get('after') ?? ''}:${term}`}
        decks={items}
        fillsScreen={!paginated}
        initialIndex={Math.max(
          0,
          items.findIndex((set) => set.id === opened),
        )}
        onOpen={onOpen}
      />
      <CollectionGrid decks={items} onOpen={onOpen} />
    </>
  ) : (
    <output>{emptyMessage(term, group, paginated)}</output>
  );
  if (detail) {
    return (
      <SavedSetBrowser
        key={`${username}:${detail.id}`}
        set={detail}
        cards={cards}
        username={username}
        backTo={`${LIBRARY_PATH}?${savedSetListParams(params)}`}
        onRemoved={onRemoved}
      />
    );
  }
  return (
    <section aria-labelledby="saved-sets-heading">
      <h2 id="saved-sets-heading" className="sr-only">
        Saved reviewers
      </h2>
      {detailFeedback || (
        <div ref={list}>
          {showStatus ? (
            <CollectionStatusMenu saved group={group} counts={counts} onChoose={chooseGroup}>
              {search}
            </CollectionStatusMenu>
          ) : (
            search
          )}
          {loading ? (
            <WhenSlow>
              <LoadingStatus className="mt-3">Loading saved reviewers…</LoadingStatus>
            </WhenSlow>
          ) : (
            sets && results
          )}
        </div>
      )}
    </section>
  );
}

function emptyMessage(term: string, group: ReviewGroup, paginated: boolean) {
  if (term) return 'No saved reviewers match your search.';
  if (paginated) return 'No more saved reviewers.';
  return `No ${group} saved reviewers.`;
}
