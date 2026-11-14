import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { LibraryFailure, sharedSetId } from '../application/library';
import { useLibraryGateway } from './LibraryProvider';
import { LIBRARY_PATH, SIGN_IN_PATH, setPath } from '../../../shared/navigation/paths';
import { secondaryButton } from '../../../shared/ui/buttonStyles';

const saveButton = `${secondaryButton} w-full disabled:bg-subtle disabled:text-muted disabled:shadow-none`;

type SaveState = 'idle' | 'saving' | 'unknown' | 'expired-form' | 'unavailable';

export function SaveSetAction({ shareCode, setKey }: Readonly<{ shareCode: string; setKey: string }>) {
  const gateway = useLibraryGateway();
  const queryClient = useQueryClient();
  const id = sharedSetId(shareCode);
  const queryKey = ['library', 'membership', id];
  const membership = useQuery({ queryKey, queryFn: () => gateway.membership(id), retry: false, staleTime: 0 });
  const [state, setState] = useState<SaveState>('idle');
  const restoreActionFocus = useRef(false);
  const signIn = `${SIGN_IN_PATH}?${new URLSearchParams({ returnTo: setPath(setKey) })}`;

  function focusResult(element: HTMLElement | null) {
    if (!element || !restoreActionFocus.current) return;
    restoreActionFocus.current = false;
    if (document.activeElement === document.body) element.focus();
  }

  async function save(button: HTMLButtonElement) {
    if (state === 'saving') return;
    restoreActionFocus.current = document.activeElement === button;
    setState('saving');
    try {
      await gateway.save(id);
      // Re-read with the current cookie: another tab may have changed accounts during the POST.
      await queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['library', 'list'] });
      // Saved sets decide Today's cards, so its cached summary is now out of date.
      queryClient.removeQueries({ queryKey: ['reviews'] });
      setState('idle');
    } catch (error) {
      if (error instanceof LibraryFailure && error.reason === 'signed-out') {
        queryClient.removeQueries({ queryKey: ['library', 'list'] });
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData(queryKey, null);
        setState('idle');
      } else if (error instanceof LibraryFailure && (error.reason === 'unavailable' || error.reason === 'expired-form')) {
        setState(error.reason);
      } else setState('unknown');
    }
  }

  if (state === 'saving') return <div><button type="button" className={saveButton} disabled>Saving…</button><output className="mt-2 block px-1 text-support text-muted">Waiting for confirmation.</output></div>;
  if (state === 'unavailable') return <p ref={focusResult} tabIndex={-1} role="alert">This set is no longer available to save.</p>;
  if (state === 'unknown' || state === 'expired-form') return <div>
    <button type="button" ref={focusResult} className={saveButton} onClick={(event) => void save(event.currentTarget)}>Try saving again</button>
    <p role="alert" className="mt-2 px-1 text-support text-muted">{state === 'unknown'
      ? 'We couldn’t confirm the save. Trying again won’t create a duplicate.'
      : 'Your form expired. Please try again.'}</p>
  </div>;
  if (membership.isPending || membership.isFetching) return <output className="flex min-h-12 items-center justify-center text-center text-support text-muted">Checking saved status…</output>;
  if (membership.isError) return <div>
    <button type="button" ref={focusResult} className={saveButton} onClick={(event) => {
      restoreActionFocus.current = document.activeElement === event.currentTarget;
      void membership.refetch();
    }}>Check again</button>
    <p role="alert" className="mt-2 px-1 text-support text-muted">Saved status couldn’t load.</p>
  </div>;
  if (membership.data === null) return <Link ref={focusResult} to={signIn} className={saveButton}>Sign in to save</Link>;
  if (membership.data) return <div>
    <Link ref={focusResult} to={LIBRARY_PATH} className={saveButton}>Open Library</Link>
    <output className="mt-2 block px-1 text-support font-semibold">Saved to your Library</output>
  </div>;
  return <button type="button" ref={focusResult} className={saveButton} onClick={(event) => void save(event.currentTarget)}>Save to Library</button>;
}
