import { useQueryClient } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { accountLink } from '../../../shared/ui/buttonStyles';
import { SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';

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
          <button type="button" className={`${accountLink} border border-line disabled:text-muted`} disabled={busy} onClick={() => void signOut()}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
          {error && <p role="alert" className="mt-3 text-body">{error}</p>}
        </div>
      </div>
    </WorkspacePage>
  );
}
