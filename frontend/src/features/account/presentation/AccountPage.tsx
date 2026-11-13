import { useQueryClient } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { accountLink } from '../../../shared/ui/buttonStyles';
import { SIGN_IN_PATH } from '../../../shared/navigation/paths';

export function AccountPage() {
  const gateway = useAccountGateway();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useOutletContext<AccountProfile>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await gateway.signOut();
      queryClient.clear();
      await navigate(SIGN_IN_PATH, { replace: true });
    } catch { setError('We could not confirm sign-out. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="max-w-lg">
      <h1 className="text-title font-extrabold tracking-tight lg:text-title-lg">Your account</h1>
      <div className="mt-5 rounded-card bg-surface p-compact-gutter shadow-card sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
              <UserRound aria-hidden="true" className="size-5" />
            </span>
            <dl className="min-w-0 flex-1 basis-24">
              <dt className="text-support text-muted">Username</dt>
              <dd className="font-bold text-section wrap-anywhere">{profile.username}</dd>
            </dl>
          </div>
          <button type="button" className={`${accountLink} border border-line disabled:text-muted`} disabled={busy} onClick={() => void signOut()}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-body">{error}</p>}
      </div>
    </section>
  );
}
