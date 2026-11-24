import { useContext, useEffect, useRef, useState, type MouseEvent } from 'react';
import { CollectionIcon } from '../../../shared/ui/CollectionIcon';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import type { SavedSet } from '../application/library';
import { DeckCarousel } from './DeckCarousel';
import { CollectionGrid } from './CollectionGrid';
import { RemoveSetAction } from './RemoveSetAction';
import { LIBRARY_PATH, reviewTopicPath, setPath } from '../../../shared/navigation/paths';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { OPENED_FROM_LIBRARY, routeState } from '../../../shared/navigation/routeState';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { primaryButton } from '../../../shared/ui/buttonStyles';

type Props = Readonly<{
  sets: SavedSet[];
  username: string;
  paginated: boolean;
  onRemoved: (title: string, focus: boolean) => void;
}>;

export function SavedSets({ sets, username, paginated, onRemoved }: Props) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const requestFocus = useContext(FocusRequestContext);
  const previousDetail = useRef<string | null>(null);
  const [opened, setOpened] = useState<string | null>(params.get('set'));
  const list = useRef<HTMLDivElement>(null);
  const term = params.get('q') ?? '';
  const matches = sets.filter((set) => set.title.toLowerCase().includes(term.trim().toLowerCase()));
  const detail = sets.find((set) => set.id === params.get('set')) ?? (sets.length === 1 ? sets[0] : undefined);
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
        if (anchor) requestFocus(anchor);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [showing, selected, requestFocus]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set('shelf', 'saved');
    if (value) next.set(key, value);
    else next.delete(key);
    const opening = key === 'set' && Boolean(value);
    setParams(next, { replace: !opening, state: { ...routeState(location), fromSavedSetList: opening } });
  }
  function onOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const id = event.currentTarget.dataset.libraryDeck;
    if (!id) return;
    event.preventDefault();
    setOpened(id);
    setParam('set', id);
  }
  const items = matches.map((set) => {
    const next = new URLSearchParams(params);
    next.set('shelf', 'saved');
    next.set('set', set.id);
    return { ...set, savedSetPath: `${LIBRARY_PATH}?${next}` };
  });
  return (
    <section aria-labelledby="saved-sets-heading">
      <h2 id="saved-sets-heading" className="sr-only">
        Saved sets
      </h2>
      {detail ? (
        <>
          {sets.length > 1 && (
            <button
              type="button"
              className="min-h-12 font-semibold text-accent"
              onClick={() => {
                if (routeState(location).fromSavedSetList) void navigate(-1);
                else setParam('set', '');
              }}
            >
              ‹ Saved sets
            </button>
          )}
          <article
            key={detail.id}
            className="max-w-2xl overflow-hidden rounded-card border border-line bg-surface shadow-control"
          >
            <div className="collection-cover">
              <p className="flex items-center gap-2 text-support font-semibold">
                <CollectionIcon kind="saved" />
                <span>Saved set</span>
              </p>
              <h3 id="saved-set-title" tabIndex={-1} className="mt-4 text-title font-bold wrap-anywhere">
                {detail.title}
              </h3>
              <p className="mt-1 text-support">
                By {detail.publisherName} · {cardCountLabel(detail.cardCount)}
              </p>
            </div>
            <div className="p-compact-gutter">
              <p className="text-body text-muted wrap-anywhere">{detail.description}</p>
              {detail.retired && <p className="mt-2 font-semibold">No longer offered · Still in your Library</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {detail.cardCount > 0 && (
                  <NavigationLink
                    className={primaryButton}
                    to={reviewTopicPath(`set-${detail.id}`, true)}
                    aria-label={`Start review: ${detail.title}`}
                  >
                    Start review
                  </NavigationLink>
                )}
                {!detail.retired && (
                  <NavigationLink
                    to={setPath(detail.setKey)}
                    state={OPENED_FROM_LIBRARY}
                    aria-label={`View set: ${detail.title}`}
                  >
                    View set
                  </NavigationLink>
                )}
              </div>
              <RemoveSetAction set={detail} username={username} onRemoved={onRemoved} />
            </div>
          </article>
        </>
      ) : (
        <div ref={list} className="relative">
          {(sets.length > 1 || term) && (
            <input
              type="search"
              aria-label="Search saved sets"
              placeholder={paginated ? 'Search sets on this page' : 'Search saved sets'}
              className="deck-search-with-position mb-3 min-h-12 max-w-full rounded-control border border-field-edge bg-surface px-3"
              value={term}
              onChange={(event) => setParam('q', event.target.value)}
            />
          )}
          {items.length ? (
            <>
              <DeckCarousel
                key={term}
                decks={items}
                fillsScreen={!paginated}
                initialIndex={Math.max(
                  0,
                  items.findIndex((s) => s.id === opened),
                )}
                onOpen={onOpen}
              />
              <CollectionGrid decks={items} onOpen={onOpen} />
            </>
          ) : (
            <output>{term ? 'No saved sets match your search.' : 'No more saved sets.'}</output>
          )}
        </div>
      )}
    </section>
  );
}
