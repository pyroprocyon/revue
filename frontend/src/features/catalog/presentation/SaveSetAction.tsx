import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { LibraryFailure, SAVED_SET_LIMIT, sharedSetId } from '../application/library';
import { useLibraryGateway } from './LibraryProvider';
import { libraryKeys, reviewKeys } from '../../../shared/cache/queryKeys';
import { LIBRARY_PATH, setPath, signInPath } from '../../../shared/navigation/paths';
import { onSessionChange, sessionRevision } from '../../../shared/navigation/sessionChanges';
import { accountOutlinedButton } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { LoadingStatus } from '../../../shared/ui/LoadingFeedback';

const saveButton = `${accountOutlinedButton} w-full wrap-anywhere disabled:bg-subtle disabled:text-muted`;

type SaveState = 'idle' | 'saving' | 'unknown' | 'expired-form' | 'unavailable' | 'saved-set-limit';

export function SaveSetAction({ shareCode, setKey }: Readonly<{ shareCode: string; setKey: string }>) {
  const revision = useSyncExternalStore(subscribeToSessionRevision, sessionRevision);
  return <SaveSetMembership key={revision} id={sharedSetId(shareCode)} setKey={setKey} revision={revision} />;
}

function subscribeToSessionRevision(notify: () => void) {
  return onSessionChange(notify, notify);
}

function SaveSetMembership({
  id,
  setKey,
  revision,
}: Readonly<{ id: string; setKey: string; revision: ReturnType<typeof sessionRevision> }>) {
  const gateway = useLibraryGateway();
  const queryClient = useQueryClient();
  const savedStatusId = useId();
  const queryKey = [...libraryKeys.membership(id), { revision }] as const;
  const membership = useQuery({ queryKey, queryFn: () => gateway.membership(id), retry: false, staleTime: 0 });
  const [state, setState] = useState<SaveState>('idle');
  const restoreActionFocus = useRef(false);
  const signIn = signInPath(setPath(setKey));

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
      void queryClient.invalidateQueries({ queryKey: libraryKeys.lists });
      void queryClient.invalidateQueries({ queryKey: libraryKeys.savedKeyLists });
      // Saved sets decide Today's cards, so its cached summary is now out of date.
      queryClient.removeQueries({ queryKey: reviewKeys.all });
      setState('idle');
    } catch (error) {
      if (error instanceof LibraryFailure && error.reason === 'signed-out') {
        queryClient.removeQueries({ queryKey: libraryKeys.lists });
        queryClient.removeQueries({ queryKey: libraryKeys.savedKeyLists });
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueryData(queryKey, null);
        setState('idle');
      } else if (
        error instanceof LibraryFailure &&
        (error.reason === 'unavailable' || error.reason === 'expired-form' || error.reason === 'saved-set-limit')
      ) {
        setState(error.reason);
      } else setState('unknown');
    }
  }

  if (state === 'saving')
    return (
      <div>
        <button type="button" className={saveButton} disabled>
          Saving…
        </button>
        <output className="sr-only">Waiting for confirmation.</output>
      </div>
    );
  if (state === 'unavailable')
    return (
      <p ref={focusResult} tabIndex={-1} role="alert">
        This reviewer is no longer available to save.
      </p>
    );
  if (state === 'saved-set-limit')
    return (
      <div className="space-y-2">
        <p role="alert" className="text-support text-muted">
          Your Library holds up to {SAVED_SET_LIMIT} saved reviewers. Remove a reviewer to make room.
        </p>
        <Link ref={focusResult} to={`${LIBRARY_PATH}?shelf=saved`} className={saveButton}>
          Open Library
        </Link>
      </div>
    );
  if (state === 'unknown' || state === 'expired-form')
    return (
      <div>
        <button
          type="button"
          ref={focusResult}
          className={saveButton}
          onClick={(event) => void save(event.currentTarget)}
        >
          Try saving again
        </button>
        <p role="alert" className="mt-2 px-1 text-support text-muted">
          {state === 'unknown'
            ? 'We couldn’t confirm the save. Trying again won’t create a duplicate.'
            : 'Your form expired. Please try again.'}
        </p>
      </div>
    );
  const hasConfirmedSavedStatus = revision !== undefined && membership.data === true;
  if (membership.isPending || (membership.isFetching && !membership.isFetchedAfterMount && !hasConfirmedSavedStatus))
    return (
      <div className="flex min-h-12 items-center justify-center text-center text-support text-muted">
        <WhenSlow>
          <LoadingStatus>Checking saved status…</LoadingStatus>
        </WhenSlow>
      </div>
    );
  if (membership.isError)
    return (
      <div>
        <button
          type="button"
          ref={focusResult}
          className={saveButton}
          disabled={membership.isFetching}
          onClick={(event) => {
            restoreActionFocus.current = document.activeElement === event.currentTarget;
            void membership.refetch();
          }}
        >
          Check again
        </button>
        <p role="alert" className="mt-2 px-1 text-support text-muted">
          Saved status couldn’t load.
        </p>
      </div>
    );
  if (membership.data === null)
    return (
      <Link ref={focusResult} to={signIn} className={saveButton}>
        Sign in to save
      </Link>
    );
  if (membership.data)
    return (
      <Link
        ref={focusResult}
        to={`${LIBRARY_PATH}?shelf=saved&set=${id}`}
        aria-labelledby={`${savedStatusId}-link`}
        aria-describedby={savedStatusId}
        className={`${saveButton} flex-wrap gap-x-2 gap-y-1`}
      >
        <span id={`${savedStatusId}-link`}>Open Library</span>
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-1 rounded-full bg-saved-set-soft px-1.5 py-0.5 text-xs font-semibold text-saved-set"
        >
          <Check className="size-[0.8125rem] shrink-0" />
          Saved
        </span>
        <span id={savedStatusId} className="sr-only">
          Saved to your Library
        </span>
      </Link>
    );
  return (
    <button
      type="button"
      ref={focusResult}
      className={saveButton}
      aria-disabled={membership.isFetching}
      onClick={(event) => {
        if (!membership.isFetching) void save(event.currentTarget);
      }}
    >
      Save to Library
    </button>
  );
}
