import { useQueryClient } from '@tanstack/react-query';
import { LogOut, UserRound } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type { AccountProfile } from '../application/account';
import { DailyNewCardSettings } from './DailyNewCardSettings';
import { InstallRevue } from './InstallRevue';
import { useAccountGateway } from './AccountProvider';
import {
  accountLink,
  destructiveOutlineButton,
  inlineConfirmationButton,
  neutralOutlineButton,
} from '../../../shared/ui/buttonStyles';
import { SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';

const signOutScrollMargin = 'scroll-mb-24 sm:scroll-mb-4';
const confirmationButton = `${signOutScrollMargin} ${inlineConfirmationButton} aria-disabled:cursor-wait aria-disabled:opacity-60`;

export function AccountPage() {
  const gateway = useAccountGateway();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useOutletContext<AccountProfile>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useLayoutEffect(() => {
    if (confirming) {
      stay.current?.focus({ preventScroll: true });
      stay.current?.closest('section')?.scrollIntoView?.({ block: 'nearest' });
      stay.current?.scrollIntoView?.({ block: 'nearest' });
    } else if (returnFocus.current) {
      trigger.current?.scrollIntoView?.({ block: 'nearest' });
      trigger.current?.focus({ preventScroll: true });
      returnFocus.current = false;
    }
  }, [confirming]);

  function closeConfirmation() {
    if (busy) return;
    returnFocus.current = true;
    setConfirming(false);
  }

  function closeOnEscape(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeConfirmation();
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
    <WorkspacePage title="Your account" className="settings-page">
      <div className="account-settings-group screen-enter rounded-card border border-line bg-surface">
        <div className="p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="grid size-13 shrink-0 place-items-center rounded-[1.125rem] bg-accent-soft text-accent">
              <UserRound aria-hidden="true" className="size-6" />
            </span>
            <dl className="min-w-0 flex-1 basis-24">
              <dt className="text-support text-muted">Username</dt>
              <dd className="text-[1.375rem] leading-tight font-bold tracking-tight wrap-anywhere">
                {profile.username}
              </dd>
            </dl>
          </div>
        </div>
        <DailyNewCardSettings key={profile.username} username={profile.username} />
        {confirming ? (
          <section
            aria-labelledby="sign-out-title"
            aria-describedby="sign-out-description"
            aria-busy={busy}
            className={`${signOutScrollMargin} p-4 sm:p-5`}
          >
            <h2 id="sign-out-title" className="text-label font-bold">
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
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                ref={stay}
                type="button"
                className={`${neutralOutlineButton} ${confirmationButton}`}
                aria-disabled={busy}
                onClick={closeConfirmation}
                onKeyDown={closeOnEscape}
              >
                Stay signed in
              </button>
              <button
                type="button"
                className={`${destructiveOutlineButton} ${confirmationButton}`}
                aria-disabled={busy}
                onClick={() => void signOut()}
                onKeyDown={closeOnEscape}
              >
                <LogOut aria-hidden="true" className="size-4 shrink-0" />
                {busy ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </section>
        ) : (
          <div className="px-1 py-1 sm:px-2">
            <button
              type="button"
              className={`${accountLink} ${signOutScrollMargin} gap-1.5 @max-[12rem]:px-2!`}
              ref={trigger}
              onClick={() => {
                setError('');
                setConfirming(true);
              }}
            >
              <LogOut aria-hidden="true" className="size-4 shrink-0" />
              Sign out
            </button>
          </div>
        )}
      </div>
      <InstallRevue />
    </WorkspacePage>
  );
}
