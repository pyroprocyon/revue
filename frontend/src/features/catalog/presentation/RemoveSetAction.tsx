import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { LibraryFailure, type LibraryPage, type SavedSet } from '../application/library';
import { useLibraryGateway } from './LibraryProvider';
import { LIBRARY_PATH, SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';

type RemoveState = 'idle' | 'confirming' | 'removing' | 'unknown' | 'expired-form' | 'still-saved' | 'signed-out';
type Props = { set: SavedSet; username: string; onRemoved: (title: string, restoreFocus: boolean) => void };
const removeButton = 'pressable inline-flex min-h-12 min-w-12 items-center justify-center rounded-control px-3 py-2 text-support font-semibold text-muted disabled:cursor-wait';

export function RemoveSetAction({ set, username, onRemoved }: Readonly<Props>) {
  const gateway = useLibraryGateway();
  const client = useQueryClient();
  const [state, setState] = useState<RemoveState>('idle');
  const busy = useRef(false);
  const restoreFocus = useRef(false);
  const warningId = useId();

  function focusResult(element: HTMLButtonElement | null) {
    if (!element || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body) element.focus();
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
      const lists = { queryKey: ['library', 'list', username] };
      await client.cancelQueries(lists);
      client.setQueriesData<LibraryPage>(lists, page => page && {
        ...page, items: page.items.filter(item => item.id !== set.id),
      });
      void client.invalidateQueries(lists);
      void client.invalidateQueries({ queryKey: ['library', 'membership', set.id] });
      // Saved sets decide Today's cards, so its cached summary is now out of date.
      client.removeQueries({ queryKey: ['reviews'] });
      onRemoved(set.title, restoreFocus.current);
    } catch (error) {
      if (error instanceof LibraryFailure && error.reason === 'signed-out') {
        client.clear();
        setState('signed-out');
      } else if (error instanceof LibraryFailure && error.reason === 'expired-form') setState('expired-form');
      else setState('unknown');
    } finally { busy.current = false; }
  }

  if (state === 'signed-out') return <Navigate replace to={`${SIGN_IN_PATH}?${new URLSearchParams({ returnTo: LIBRARY_PATH })}`} />;
  if (state === 'removing') return <button type="button" className={removeButton} disabled>Removing…</button>;
  if (state === 'confirming') return <div className="@container/removal basis-full rounded-control bg-subtle p-compact-gutter">
    <p id={warningId} className="text-support">{set.retired ? 'This set is no longer offered.' : 'This set is for practice only.'} If you remove it, you won’t be able to save it again. Your progress is kept.</p>
    <div className="mt-4 grid gap-3 @min-[24rem]/removal:grid-cols-2">
      <button type="button" ref={focusResult} className={secondaryButton} onClick={() => {
        restoreFocus.current = true;
        setState('idle');
      }}>Keep set</button>
      <button type="button" className={primaryButton} aria-describedby={warningId} onClick={(event) => void remove(event.currentTarget)}>Remove from Library</button>
    </div>
  </div>;
  if (state !== 'idle') return <div className="basis-full">
    <p role="alert" className="text-support text-muted">{removalError(state)}</p>
    <button type="button" ref={focusResult} className={`${secondaryButton} mt-3`} onClick={(event) => void remove(event.currentTarget)}>Try removing again</button>
  </div>;
  return <button type="button" ref={focusResult} className={removeButton} aria-label={`Remove from Library: ${set.title}`} onClick={(event) => {
    if (set.retired || !set.saveAllowed) {
      restoreFocus.current = document.activeElement === event.currentTarget;
      setState('confirming');
    } else void remove(event.currentTarget);
  }}>Remove</button>;
}

function removalError(state: 'unknown' | 'expired-form' | 'still-saved') {
  if (state === 'expired-form') return 'Your form expired. Please try again.';
  if (state === 'still-saved') return 'This set is still saved. It may have been saved again in another tab.';
  return 'We couldn’t confirm removal. Please try again. Your progress is kept.';
}
