import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
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

  return <>
    <h1 className="text-title font-extrabold tracking-tight">Your account</h1>
    <section className="mt-6 max-w-lg rounded-card bg-surface p-compact-gutter shadow-card sm:p-6">
      <h2 className="text-section font-bold">
        You’re signed in, <span className="mt-2 block wrap-anywhere text-body font-semibold text-muted">{profile.username}</span>
      </h2>
      <button type="button" className={`${secondaryButton} mt-6 border border-line`} disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</button>
      {error && <p role="alert" className="mt-4 text-body">{error}</p>}
    </section>
  </>;
}
