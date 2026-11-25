import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { LibraryFailure, type LibraryPage, type SavedSet } from '../application/library';
import { useLibraryGateway } from './LibraryProvider';
import { libraryKeys, reviewKeys } from '../../../shared/cache/queryKeys';
import { LIBRARY_PATH } from '../../../shared/navigation/paths';
import { SessionExpiredRedirect } from '../../../shared/navigation/SessionExpiredRedirect';
import { useStillMounted } from '../../../shared/ui/useStillMounted';
import {
  destructiveOutlineButton,
  inlineConfirmationButton,
  neutralOutlineButton,
  secondaryButton,
} from '../../../shared/ui/buttonStyles';

type RemoveState = 'idle' | 'confirming' | 'removing' | 'unknown' | 'expired-form' | 'still-saved' | 'signed-out';
type Props = { set: SavedSet; username: string; onRemoved: (title: string, restoreFocus: boolean) => void };

export function useRemoveSetAction({ set, username, onRemoved }: Readonly<Props>) {
  const gateway = useLibraryGateway();
  const client = useQueryClient();
  const [state, setState] = useState<RemoveState>('idle');
  const stillViewingReviewer = useStillMounted();
  const busy = useRef(false);
  const restoreFocus = useRef(false);
  const titleId = useId();
  const warningId = useId();

  function focusResult(element: HTMLButtonElement | null, revealPrompt = false) {
    if (!element || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body) element.focus({ preventScroll: revealPrompt });
    if (revealPrompt) element.closest('section')?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  }

  async function remove(button: HTMLButtonElement) {
    if (busy.current) return;
    busy.current = true;
    restoreFocus.current = document.activeElement === button;
    setState('removing');
    try {
      await gateway.remove(set.id);
      const saved = await gateway.membership(set.id);
      if (saved === null) throw new LibraryFailure('signed-out');
      if (saved) {
        setState('still-saved');
        return;
      }
      // Apply confirmed removal before reloading, so a slow read cannot hold the action open.
      const lists = { queryKey: libraryKeys.listsOf(username) };
      const detail = { queryKey: libraryKeys.detail(username, set.id) };
      const savedKeys = { queryKey: libraryKeys.savedKeys(username) };
      await Promise.all([client.cancelQueries(lists), client.cancelQueries(detail), client.cancelQueries(savedKeys)]);
      client.setQueryData<string[]>(savedKeys.queryKey, (keys) => keys?.filter((key) => key !== set.setKey));
      void client.invalidateQueries(savedKeys);
      const group = set.reviewsPaused ? 'paused' : 'active';
      client.setQueriesData<LibraryPage>(
        lists,
        (page) =>
          page && {
            ...page,
            items: page.items.filter((item) => item.id !== set.id),
            counts: page.counts && { ...page.counts, [group]: Math.max(0, page.counts[group] - 1) },
          },
      );
      client.removeQueries(detail);
      client.removeQueries({ queryKey: libraryKeys.cardPages(username, set.id) });
      void client.invalidateQueries(lists);
      void client.resetQueries({ queryKey: libraryKeys.membership(set.id) });
      // Saved sets decide Today's cards, so its cached summary is now out of date.
      client.removeQueries({ queryKey: reviewKeys.all });
      if (stillViewingReviewer.current) onRemoved(set.title, restoreFocus.current);
    } catch (error) {
      if (error instanceof LibraryFailure && error.reason === 'signed-out') {
        client.clear();
        setState('signed-out');
      } else if (error instanceof LibraryFailure && error.reason === 'expired-form') setState('expired-form');
      else setState('unknown');
    } finally {
      busy.current = false;
    }
  }

  function changeConfirmation(next: 'idle' | 'confirming') {
    restoreFocus.current = true;
    setState(next);
  }
  return { state, changeConfirmation, titleId, warningId, focusResult, remove };
}

export function RemoveSetAction({
  set,
  action,
}: Readonly<{ set: SavedSet; action: ReturnType<typeof useRemoveSetAction> }>) {
  const { state, changeConfirmation, titleId, warningId, focusResult, remove } = action;

  const { search } = useLocation();
  if (state === 'signed-out') return <SessionExpiredRedirect returnTo={LIBRARY_PATH + search} />;
  if (state === 'removing')
    return (
      <button
        type="button"
        className={`${destructiveOutlineButton} w-full disabled:cursor-wait disabled:border-line disabled:text-muted`}
        disabled
      >
        Removing…
      </button>
    );
  if (state === 'confirming')
    return (
      <section aria-labelledby={titleId}>
        <h3 id={titleId} className="text-label font-bold">
          Remove from Library?
        </h3>
        <p id={warningId} className="mt-1 max-w-[46ch] text-support text-muted">
          {set.retired && 'This reviewer is no longer offered. '}
          {!set.retired && !set.saveAllowed && 'This reviewer is for practice only. '}
          Your progress is kept.{' '}
          {set.retired || !set.saveAllowed
            ? 'If you remove it, you won’t be able to save it again.'
            : 'You can save this reviewer again from its page.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            ref={(element) => focusResult(element, true)}
            className={`${neutralOutlineButton} ${inlineConfirmationButton}`}
            aria-describedby={warningId}
            onClick={() => changeConfirmation('idle')}
          >
            Keep
          </button>
          <button
            type="button"
            className={`${destructiveOutlineButton} ${inlineConfirmationButton}`}
            aria-describedby={warningId}
            onClick={(event) => void remove(event.currentTarget)}
          >
            <Trash2 aria-hidden="true" className="size-[1.125em] shrink-0" />
            Remove
          </button>
        </div>
      </section>
    );
  if (state !== 'idle')
    return (
      <div className="basis-full">
        <p role="alert" className="text-support text-muted">
          {removalError(state)}
        </p>
        <button
          type="button"
          ref={focusResult}
          className={`${secondaryButton} mt-3`}
          onClick={(event) => void remove(event.currentTarget)}
        >
          Try removing again
        </button>
      </div>
    );
  return (
    <button
      type="button"
      ref={focusResult}
      className={`${destructiveOutlineButton} w-full`}
      aria-label={`Remove from Library: ${set.title}`}
      onClick={() => changeConfirmation('confirming')}
    >
      <Trash2 aria-hidden="true" className="size-[1.125em] shrink-0" />
      Remove
    </button>
  );
}

function removalError(state: 'unknown' | 'expired-form' | 'still-saved') {
  if (state === 'expired-form') return 'Your form expired. Please try again.';
  if (state === 'still-saved') return 'This reviewer is still saved. It may have been saved again in another tab.';
  return 'We couldn’t confirm removal. Please try again. Your progress is kept.';
}
