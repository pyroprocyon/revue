import { useContext, useLayoutEffect, useRef } from 'react';
import type { useDeckCards } from './useDecks';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';
import { LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { secondaryButton } from '../../../shared/ui/buttonStyles';

export function MoreCards({
  cards,
  onEarlier,
}: Readonly<{ cards: ReturnType<typeof useDeckCards>; onEarlier?: () => void }>) {
  const pages = cards.data?.pages;
  const button = useRef<HTMLButtonElement>(null);
  const pending = useRef<{ index: number; scrollTop: number | null } | null>(null);
  const requestFocus = useContext(FocusRequestContext);
  useLayoutEffect(() => {
    function rememberScroll() {
      if (pending.current && pending.current.scrollTop !== null) pending.current.scrollTop = window.scrollY;
    }
    window.addEventListener('scroll', rememberScroll, { passive: true });
    return () => window.removeEventListener('scroll', rememberScroll);
  }, []);
  useLayoutEffect(() => {
    if (cards.isFetchNextPageError) pending.current = null;
    const load = pending.current;
    if (!load || !pages?.[load.index]) return;
    pending.current = null;
    if (load.scrollTop !== null) {
      // WebKit can scroll upward when the final batch replaces the focused button.
      if (window.scrollY !== load.scrollTop) window.scrollTo({ top: load.scrollTop, behavior: 'instant' });
      return;
    }
    const first = pages[load.index].items[0];
    if (first && (document.activeElement === document.body || document.activeElement === button.current)) {
      requestFocus(document.querySelector<HTMLElement>(`[data-card-row="${first.id}"]`));
    }
  }, [cards.isFetchNextPageError, pages, requestFocus]);

  if (!cards.hasNextPage && !onEarlier) return null;
  return (
    <div className="grid gap-2 [overflow-anchor:none]">
      {onEarlier && (
        <button type="button" className={secondaryButton} onClick={onEarlier}>
          Show earlier cards
        </button>
      )}
      {cards.isFetchNextPageError && (
        <p role="alert" className="text-support text-muted">
          Couldn’t load more cards. Check your connection.
        </p>
      )}
      {cards.hasNextPage && (
        <button
          ref={button}
          type="button"
          className={secondaryButton}
          aria-disabled={cards.isFetching}
          onClick={(event) => {
            if (cards.isFetching || !pages) return;
            pending.current = { index: pages.length, scrollTop: event.detail === 0 ? null : window.scrollY };
            void cards.fetchNextPage({ cancelRefetch: false });
          }}
        >
          {cards.isFetchNextPageError ? 'Try again' : 'Show more cards'}
        </button>
      )}
      {cards.isFetchingNextPage && (
        <WhenSlow>
          <LoadingStatus>Loading more cards…</LoadingStatus>
        </WhenSlow>
      )}
    </div>
  );
}
