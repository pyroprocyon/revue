import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
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

const PASSWORD_MISMATCH = 'Passwords don’t match.';

const inputStyle = 'min-h-14 w-full rounded-control border border-field-edge bg-surface px-4 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function AccountForm({ register = false }: Readonly<{ register?: boolean }>) {
  const gateway = useAccountGateway();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search] = useSearchParams();
  const returnPath = safeAccountReturnPath(search.get('returnTo'));
  const signInPath = returnPath ? `${SIGN_IN_PATH}?${new URLSearchParams({ returnTo: returnPath })}` : SIGN_IN_PATH;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const invitation = useInvitation(register);
  const needsInvitation = register && invitation === '';
  const idleAction = register ? 'Create account' : 'Sign in';
  const actionLabel = busy ? 'Please wait…' : idleAction;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || needsInvitation) return;
    if (register && password !== passwordConfirmation) {
      setError(PASSWORD_MISMATCH);
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (register) await gateway.register({ username, password, invitation });
      else await gateway.signIn(username, password);
      setPassword('');
      setPasswordConfirmation('');
      queryClient.clear();
      await navigate(returnPath ?? ACCOUNT_PATH, { replace: true });
    } catch (error_) {
      setPassword('');
      setPasswordConfirmation('');
      setError(error_ instanceof Error ? error_.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function clearPasswordMismatch() {
    if (error === PASSWORD_MISMATCH) setError('');
  }

  const passwordId = register ? 'new-password' : 'current-password';
  const confirmationMismatch = error === PASSWORD_MISMATCH;

  return (
    <Screen top={<div className="mx-auto"><HomeLink /></div>}>
      <section className="mx-auto w-full max-w-[28rem] py-6 sm:py-10 lg:py-14">
        <div className="rounded-card bg-surface p-4 shadow-card sm:p-8">
          <h1 className="text-title font-extrabold tracking-tight">{register ? 'Create your account' : 'Welcome back'}</h1>
          {needsInvitation && (
            <output className="mt-5 block rounded-inset bg-subtle p-4 text-body">
              Open your invitation link to continue.
            </output>
          )}
          <form id="account-form" onSubmit={(event) => void submit(event)} className="mt-7 grid gap-5" aria-busy={busy}>
            <div>
              <label htmlFor="username" className="text-label font-semibold">Username</label>
              <input id="username" className={`${inputStyle} mt-2 block`} name="username" autoComplete="username"
                autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32}
                value={username} onChange={(event) => setUsername(event.target.value)}
                aria-describedby={register ? 'username-help' : undefined} />
              {register && <span id="username-help" className="mt-1 block text-support text-muted">3–32 letters, numbers, underscores or hyphens.</span>}
            </div>
            <div>
              <label htmlFor={passwordId} className="text-label font-semibold">Password</label>
              <div className="relative mt-2">
                <input id={passwordId} className={`${inputStyle} block pr-[56px]`} name="password" type={show ? 'text' : 'password'}
                  required minLength={6} autoComplete={register ? 'new-password' : 'current-password'} value={password}
                  onChange={(event) => { setPassword(event.target.value); clearPasswordMismatch(); }} aria-describedby={register ? 'password-help' : undefined} />
                <PasswordVisibilityToggle fieldId={passwordId} label="password" show={show} onToggle={() => setShow(!show)} />
              </div>
              {register && <span id="password-help" className="mt-1 block text-support text-muted">6–64 characters. Spaces are welcome.</span>}
            </div>
            {register && (
              <div>
                <label htmlFor="confirm-password" className="text-label font-semibold">Confirm password</label>
                <div className="relative mt-2">
                  <input id="confirm-password" className={`${inputStyle} block pr-[56px]`} name="passwordConfirmation"
                    type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" required minLength={6}
                    value={passwordConfirmation}
                    onChange={(event) => { setPasswordConfirmation(event.target.value); clearPasswordMismatch(); }}
                    aria-invalid={confirmationMismatch || undefined} aria-describedby={confirmationMismatch ? 'account-error' : undefined} />
                  <PasswordVisibilityToggle fieldId="confirm-password" label="confirmation password"
                    show={showConfirmation} onToggle={() => setShowConfirmation(!showConfirmation)} />
                </div>
              </div>
            )}
            {error && <p id="account-error" ref={errorRef} tabIndex={-1} role="alert" className="rounded-inset bg-highlight-soft p-4 text-support text-ink focus-visible:outline-2 focus-visible:outline-accent">{error}</p>}
            <button className={`${primaryButton} w-full`} type="submit" disabled={busy || needsInvitation}>
              {actionLabel}
            </button>
          </form>
          <p className="mt-6 text-center text-support text-muted">
            {register ? <>Already have an account? <Link to={signInPath} className={textLink}>Sign in</Link>.</> : <>Forgot your password? <SupportLink>Contact support</SupportLink>.</>}
          </p>
        </div>
        <div className="flex justify-center">
          <PolicyLinks newTab={register} showPrivacy={!register} showSupport={register} />
        </div>
      </section>
    </Screen>
  );
}

function PasswordVisibilityToggle({ fieldId, label, show, onToggle }: Readonly<{
  fieldId: string;
  label: string;
  show: boolean;
  onToggle: () => void;
}>) {
  const action = show ? 'Hide' : 'Show';
  const Icon = show ? EyeOff : Eye;
  return (
    <button type="button" aria-label={`${action} ${label}`} aria-controls={fieldId} onClick={onToggle}
      className="pressable absolute inset-y-0 right-0 inline-flex min-h-12 w-[48px] items-center justify-center rounded-control text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <Icon aria-hidden="true" size={20} />
    </button>
  );
}

function useInvitation(register: boolean) {
  const [invitation, setInvitation] = useState(() => invitationFromFragment() ?? '');
  useEffect(() => {
    if (!register) return;
    function receiveInvitation() {
      if (window.location.hash === '') return;
      const incoming = invitationFromFragment();
      if (incoming !== null) setInvitation(incoming);
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
    receiveInvitation();
    window.addEventListener('hashchange', receiveInvitation);
    return () => window.removeEventListener('hashchange', receiveInvitation);
  }, [register]);
  return invitation;
}

function invitationFromFragment(): string | null {
  const fragment = window.location.hash.slice(1);
  if (/^(?:[A-Za-z0-9_-]{8}|[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/.test(fragment)) return fragment;
  return new URLSearchParams(fragment).get('invite');
}
