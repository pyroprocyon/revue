import { useQueryClient } from '@tanstack/react-query';
import { LogOut, UserRound } from 'lucide-react';
import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { accountLink } from '../../../shared/ui/buttonStyles';
import { InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';
import { SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';

export function AccountPage() {
  const gateway = useAccountGateway();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useOutletContext<AccountProfile>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const paused = useContext(InteractionPausedContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const showConfirmation = confirming && !paused;

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!showConfirmation || !element) return;
    element.showModal();
    return () => element.close();
  }, [showConfirmation]);

  function staySignedIn() {
    dialog.current?.close();
    setConfirming(false);
    trigger.current?.focus();
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await gateway.signOut();
      queryClient.clear();
      await navigate(SIGN_IN_PATH, { replace: true });
    } catch {
      setError('We could not confirm sign-out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspacePage title="Your account">
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        <div className="p-compact-gutter py-6 sm:p-8">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
              <UserRound aria-hidden="true" className="size-7" />
            </span>
            <dl className="min-w-0 flex-1 basis-24">
              <dt className="text-support text-muted">Username</dt>
              <dd className="mt-1 text-title font-bold tracking-tight wrap-anywhere">{profile.username}</dd>
            </dl>
          </div>
        </div>
        <div className="border-t border-line px-compact-gutter py-3 sm:px-8">
          <button
            type="button"
            className={`${accountLink} border border-line`}
            ref={trigger}
            aria-haspopup="dialog"
            onClick={() => {
              setError('');
              setConfirming(true);
            }}
          >
            Sign out
          </button>
          {showConfirmation && (
            <dialog
              ref={dialog}
              aria-labelledby="sign-out-title"
              aria-describedby="sign-out-description"
              aria-busy={busy}
              onCancel={(event) => {
                event.preventDefault();
                if (!busy) staySignedIn();
              }}
              className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-32px)] max-w-[26rem] overflow-y-auto rounded-card bg-surface p-5 text-ink shadow-card backdrop:bg-ink/40 sm:p-6"
            >
              <span className="mb-3 grid size-10 place-items-center rounded-inset bg-highlight-soft text-highlight-strong">
                <LogOut aria-hidden="true" className="size-5" />
              </span>
              <h2 id="sign-out-title" className="text-section font-bold">
                Sign out of Revue?
              </h2>
              <p id="sign-out-description" className="mt-2 text-body text-muted">
                You’ll need to sign in again to continue studying with this account.
              </p>
              {error && (
                <p role="alert" className="mt-3 text-body">
                  {error}
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="pressable min-h-12 rounded-control border border-line bg-surface px-3 py-2 text-label font-semibold disabled:text-muted"
                  disabled={busy}
                  onClick={staySignedIn}
                >
                  Stay signed in
                </button>
                <button
                  type="button"
                  className="pressable min-h-12 rounded-control bg-highlight-soft px-4 py-2 text-label font-semibold text-highlight-strong aria-disabled:bg-subtle aria-disabled:text-muted"
                  aria-disabled={busy}
                  onClick={() => void signOut()}
                >
                  {busy ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </dialog>
          )}
        </div>
      </div>
    </WorkspacePage>
  );
}
