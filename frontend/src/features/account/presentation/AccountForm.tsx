import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { safeAccountReturnPath } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { PolicyLinks } from '../../../shared/ui/PolicyLinks';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { SupportLink } from '../../../shared/ui/SupportLink';
import { Screen } from '../../../shared/ui/Screen';
import { primaryButton, textLink } from '../../../shared/ui/buttonStyles';
import { ACCOUNT_PATH, SIGN_IN_PATH } from '../../../shared/navigation/paths';

const inputStyle = 'mt-2 min-h-12 w-full rounded-control border border-field-edge bg-surface px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function AccountForm({ register = false }: { register?: boolean }) {
  const gateway = useAccountGateway();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search] = useSearchParams();
  const returnPath = safeAccountReturnPath(search.get('returnTo'));
  const signInPath = returnPath ? `${SIGN_IN_PATH}?${new URLSearchParams({ returnTo: returnPath })}` : SIGN_IN_PATH;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invitation, setInvitation] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '');
  const [adult, setAdult] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const needsInvitation = register && invitation === '';
  const idleAction = register ? 'Create account' : 'Sign in';
  const actionLabel = busy ? 'Please wait…' : idleAction;

  useEffect(() => {
    if (!register) return;
    function receiveInvitation() {
      if (window.location.hash === '') return;
      const incoming = new URLSearchParams(window.location.hash.slice(1)).get('invite');
      if (incoming !== null) setInvitation(incoming);
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
    receiveInvitation();
    window.addEventListener('hashchange', receiveInvitation);
    return () => window.removeEventListener('hashchange', receiveInvitation);
  }, [register]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || needsInvitation) return;
    setBusy(true);
    setError('');
    try {
      if (register) await gateway.register({ username, password, invitation, adult, privacy });
      else await gateway.signIn(username, password);
      setPassword('');
      queryClient.clear();
      await navigate(returnPath ?? ACCOUNT_PATH, { replace: true });
    } catch (failure) {
      setPassword('');
      setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen top={<HomeLink />} actions={
      <button className={`${primaryButton} w-full`} type="submit" form="account-form" disabled={busy || needsInvitation}>
        {actionLabel}
      </button>
    }>
      <section className="pt-6">
        <h1 className="text-title font-extrabold tracking-tight">{register ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-3 text-body text-muted">{register ? 'Choose a username and a password you’ll remember.' : 'Sign in with your username and password.'}</p>
        {needsInvitation && <p role="status" className="mt-5 rounded-card bg-surface p-4 text-body">Open the invitation link from the person who invited you. Already registered? <Link className={textLink} to={signInPath}>Sign in</Link>.</p>}
        <form id="account-form" onSubmit={(event) => void submit(event)} className="mt-6 grid gap-5" aria-busy={busy}>
          <label className="text-label font-semibold">Username
            <input className={inputStyle} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
              required minLength={3} maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)}
              aria-describedby={register ? 'username-help' : undefined} />
            {register && <span id="username-help" className="mt-1 block text-support font-normal text-muted">3–32 letters, numbers, underscores or hyphens.</span>}
          </label>
          <label className="text-label font-semibold">Password
            <input className={inputStyle} name="password" type={show ? 'text' : 'password'} required minLength={6}
              autoComplete={register ? 'new-password' : 'current-password'} value={password}
              onChange={(event) => setPassword(event.target.value)} aria-describedby={register ? 'password-help' : undefined} />
            {register && <span id="password-help" className="mt-1 block text-support font-normal text-muted">6–64 characters. Spaces are welcome.</span>}
          </label>
          <label className="flex min-h-12 items-center gap-3 text-body">
            <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} className="size-5 accent-accent" />Show password
          </label>
          {register && <>
            <label className="flex min-h-12 items-start gap-3 text-body"><input className="mt-1 size-5 shrink-0 accent-accent" type="checkbox" required checked={adult} onChange={(event) => setAdult(event.target.checked)} />I’m at least 18 years old.</label>
            <label className="flex min-h-12 items-start gap-3 text-body"><input className="mt-1 size-5 shrink-0 accent-accent" type="checkbox" required checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} /><span>I’ve read the <Link to="/privacy" target="_blank" rel="noreferrer" className={textLink}>privacy notice<span className="sr-only"> (opens in a new tab)</span></Link>.</span></label>
          </>}
          {error && <p ref={errorRef} tabIndex={-1} role="alert" className="focus-visible:outline-2 focus-visible:outline-accent rounded-card bg-surface p-4 text-body text-ink">{error}</p>}
        </form>
        <p className="mt-6 text-support text-muted">{register ? <>Already registered? <Link to={signInPath} className={textLink}>Sign in</Link>.</> : <>Forgot your password? <SupportLink>Contact support</SupportLink>.</>}</p>
        <PolicyLinks newTab={register} />
      </section>
    </Screen>
  );
}
