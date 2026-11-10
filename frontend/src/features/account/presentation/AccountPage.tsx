import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { Screen } from '../../../shared/ui/Screen';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { SETS_PATH, SIGN_IN_PATH } from '../../../shared/navigation/paths';

export function AccountPage() {
  const gateway = useAccountGateway();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void gateway.current().then((current) => {
      if (!active) return;
      if (current === null) void navigate(SIGN_IN_PATH, { replace: true });
      else setProfile(current);
    }).catch(() => { if (active) setError('We could not load your account. Please refresh and try again.'); });
    return () => { active = false; };
  }, [gateway, navigate]);

  async function signOut() {
    setBusy(true);
    try {
      await gateway.signOut();
      queryClient.clear();
      await navigate(SIGN_IN_PATH, { replace: true });
    } catch { setError('We could not confirm sign-out. Please try again.'); }
    finally { setBusy(false); }
  }

  return <Screen top={<HomeLink />} actions={<Link to={SETS_PATH} className={`${primaryButton} w-full`}>Browse sets</Link>}>
    <section className="pt-6">
      <h1 className="text-title font-extrabold tracking-tight">{profile ? `You’re signed in, ${profile.username}` : 'Your account'}</h1>
      {profile && <><p className="mt-4 text-body text-muted">Your account is ready. Saving sets and study progress is coming next.</p>
        <button type="button" className={`${secondaryButton} mt-6`} disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</button></>}
      {error && <p role="alert" className="mt-4 text-body">{error}</p>}
    </section>
  </Screen>;
}
