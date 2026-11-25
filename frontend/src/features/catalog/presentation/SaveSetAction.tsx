import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { LibraryFailure, SAVED_SET_LIMIT, sharedSetId } from '../application/library';
import { useLibraryGateway } from './LibraryProvider';
import { libraryKeys, reviewKeys } from '../../../shared/cache/queryKeys';
import { forgetCsrfToken } from '../../../shared/http/sameOriginRequest';
import { LIBRARY_PATH, setPath, signInPath } from '../../../shared/navigation/paths';
import { publicSessionKey } from '../../../shared/navigation/publicSession';
import { onSessionChange, sessionRevision, sessionSnapshot } from '../../../shared/navigation/sessionChanges';
import { accountOutlinedButton } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';

const saveButton = `${accountOutlinedButton} w-full wrap-anywhere disabled:bg-subtle disabled:text-muted`;

type SaveState = 'idle' | 'saving' | 'unknown' | 'expired-form' | 'unavailable' | 'saved-set-limit';

export function SaveSetAction({ shareCode, setKey }: Readonly<{ shareCode: string; setKey: string }>) {
  const session = useSyncExternalStore(subscribeToSessionChanges, sessionSnapshot);
  return <SaveSetMembership key={session} id={sharedSetId(shareCode)} setKey={setKey} session={session} />;
}

function subscribeToSessionChanges(notify: () => void) {
  return onSessionChange(notify, notify);
}

function SaveSetMembership({ id, setKey, session }: Readonly<{ id: string; setKey: string; session: string }>) {
  const gateway = useLibraryGateway();
  const queryClient = useQueryClient();
  const savedStatusId = useId();
  const queryKey = [...libraryKeys.membership(id), { session }] as const;
  const membership = useQuery({
    queryKey,
    queryFn: async () => {
      const saved = await gateway.membership(id);
      if (saved === null) await recordSignedOut();
      return saved;
    },
    retry: false,
    staleTime: 0,
  });
  const [state, setState] = useState<SaveState>('idle');
  const restoreActionFocus = useRef(false);
  const signIn = signInPath(setPath(setKey));

  function focusResult(element: HTMLElement | null) {
    if (!element || !restoreActionFocus.current) return;
    restoreActionFocus.current = false;
    if (document.activeElement === document.body) element.focus();
  }

  async function recordSignedOut() {
    if (sessionSnapshot() !== session) return;
    await queryClient.cancelQueries({ queryKey: publicSessionKey, exact: true });
    if (sessionSnapshot() !== session) return;
    forgetCsrfToken();
    queryClient.setQueryData(publicSessionKey, false);
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
        if (sessionSnapshot() !== session) return;
        queryClient.removeQueries({ queryKey: libraryKeys.lists });
        queryClient.removeQueries({ queryKey: libraryKeys.savedKeyLists });
        await queryClient.cancelQueries({ queryKey });
        await recordSignedOut();
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
  const hasConfirmedSavedStatus = sessionRevision() !== undefined && typeof membership.data === 'boolean';
  if (membership.isPending || (membership.isFetching && !membership.isFetchedAfterMount && !hasConfirmedSavedStatus))
    return (
      <div className="grid min-h-12 place-items-center rounded-control border border-line px-2">
        <span className="loading-bar" aria-hidden="true" />
        <WhenSlow>
          <output className="sr-only">Checking saved status…</output>
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
