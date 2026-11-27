import { useFirstInput } from '../../../shared/ui/useFirstInput';
import { useQueryClient } from '@tanstack/react-query';
import { deckKeys, libraryKeys, pendingLoginKey, reviewKeys } from '../../../shared/cache/queryKeys';
import { publicSessionKey, usePublicSession } from '../../../shared/navigation/publicSession';
import { saveSignedInHint } from '../../../shared/navigation/signedInHint';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { safeAccountReturnPath, SignupRateLimitedError } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { forgetConfirmedProfile } from './confirmedProfile';
import { PolicyLinks } from '../../../shared/ui/PolicyLinks';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { SupportLink } from '../../../shared/ui/SupportLink';
import { FormLayout } from '../../../shared/ui/FormLayout';
import { primaryButton, textLink, textLinkTarget } from '../../../shared/ui/buttonStyles';
import { TODAY_PATH, signInPath } from '../../../shared/navigation/paths';

const PASSWORD_MISMATCH = 'Passwords don’t match.';

const RETRY_UNITS = [
  { name: 'day', milliseconds: 86_400_000 },
  { name: 'hour', milliseconds: 3_600_000 },
  { name: 'minute', milliseconds: 60_000 },
];
const RETRY_SECOND = { name: 'second', milliseconds: 1000 };

const inputStyle =
  'min-h-14 w-full rounded-control border border-field-edge bg-surface px-4 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function signupWaitUntil(deadline: number | null) {
  if (deadline === null) return null;
  const remainingMs = deadline - performance.now();
  if (remainingMs <= 0) return null;
  const unit = RETRY_UNITS.find(({ milliseconds }) => remainingMs > milliseconds) ?? RETRY_SECOND;
  const amount = Math.ceil(remainingMs / unit.milliseconds);
  return {
    deadline,
    label: `${amount} ${unit.name}${amount === 1 ? '' : 's'}`,
    nextUpdateAt: deadline - (amount - 1) * unit.milliseconds,
  };
}

function submitButtonLabel(
  readyAction: string,
  { busy, checking, waitLabel }: { busy: boolean; checking: boolean; waitLabel: string | undefined },
) {
  if (busy) return 'Please wait…';
  if (waitLabel) return `Try again in ${waitLabel}`;
  if (checking) return 'Checking your session…';
  return readyAction;
}

export function AccountForm({ register = false }: Readonly<{ register?: boolean }>) {
  const gateway = useAccountGateway();
  const checking = usePublicSession() === 'checking';
  const firstInput = useFirstInput(gateway.prepareWrite);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search] = useSearchParams();
  const returnPath = safeAccountReturnPath(search.get('returnTo'));
  const signInLink = signInPath(returnPath);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | SignupRateLimitedError>('');
  const [signupWait, setSignupWait] = useState<ReturnType<typeof signupWaitUntil>>(null);
  const retryDeadline = signupWait?.deadline ?? null;
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (retryDeadline === null) return;
    let timer: number | undefined;
    const updateCountdown = () => {
      const wait = signupWaitUntil(retryDeadline);
      setSignupWait(wait);
      if (wait) timer = window.setTimeout(updateCountdown, Math.ceil(wait.nextUpdateAt - performance.now()));
    };
    updateCountdown();
    return () => window.clearTimeout(timer);
  }, [retryDeadline]);

  const retryingSignup = error instanceof SignupRateLimitedError;
  const signupFeedback = signupWait
    ? 'Signup is busy. Your entries are still here.'
    : 'Signup was busy. You can try again now.';
  const idleAction = register ? 'Create account' : 'Sign in';
  const readyAction = retryingSignup ? 'Try again' : idleAction;
  const actionLabel = submitButtonLabel(readyAction, { busy, checking, waitLabel: signupWait?.label });
  const submitDisabled = busy || checking || signupWait !== null;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled) return;
    if (register && password !== passwordConfirmation) {
      setError(PASSWORD_MISMATCH);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const profile = register
        ? await gateway.register({ username, password })
        : await gateway.signIn(username, password);
      setPassword('');
      setPasswordConfirmation('');
      await queryClient.cancelQueries({ queryKey: publicSessionKey, exact: true });
      queryClient.removeQueries({ queryKey: libraryKeys.all });
      queryClient.removeQueries({ queryKey: reviewKeys.all });
      queryClient.removeQueries({ queryKey: deckKeys.all });
      forgetConfirmedProfile(queryClient);
      queryClient.setQueryData(pendingLoginKey, profile.username);
      queryClient.setQueryData(publicSessionKey, true);
      // Leaving this page can skip the public layout's own update, so save the hint here too.
      saveSignedInHint(true);
      await navigate(returnPath ?? TODAY_PATH, { replace: true });
    } catch (error_) {
      if (register && error_ instanceof SignupRateLimitedError) {
        setError(error_);
        setSignupWait(signupWaitUntil(error_.retryDeadline));
        return;
      }
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
    <FormLayout
      top={
        <div className="mx-auto">
          <HomeLink />
        </div>
      }
      footer={<PolicyLinks newTab={register} showPrivacy={!register} showSupport={register} />}
    >
      <h1 className="text-title font-extrabold tracking-tight">{register ? 'Create your account' : 'Welcome back'}</h1>
      <form
        onInput={firstInput}
        id="account-form"
        onSubmit={(event) => void submit(event)}
        className="mt-6 grid gap-4 sm:gap-5"
        aria-busy={busy}
      >
        <div>
          <label htmlFor="username" className="text-label font-semibold">
            Username
          </label>
          <input
            id="username"
            className={`${inputStyle} mt-2 block`}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={32}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-describedby={register ? 'username-help' : undefined}
          />
          {register && (
            <span id="username-help" className="mt-1 block text-support text-muted">
              3–32 letters, numbers, underscores or hyphens.
            </span>
          )}
        </div>
        <div>
          <label htmlFor={passwordId} className="text-label font-semibold">
            Password
          </label>
          <div className="relative mt-2">
            <input
              id={passwordId}
              className={`${inputStyle} block pr-[56px]`}
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete={register ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearPasswordMismatch();
              }}
              aria-describedby={register ? 'password-help' : undefined}
            />
            <PasswordVisibilityToggle
              fieldId={passwordId}
              label="password"
              show={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
            />
          </div>
          {register && (
            <span id="password-help" className="mt-1 block text-support text-muted">
              6–64 characters. Spaces are welcome.
            </span>
          )}
        </div>
        {register && (
          <div>
            <label htmlFor="confirm-password" className="text-label font-semibold">
              Confirm password
            </label>
            <div className="relative mt-2">
              <input
                id="confirm-password"
                className={`${inputStyle} block pr-[56px]`}
                name="passwordConfirmation"
                type={showConfirmation ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                value={passwordConfirmation}
                onChange={(event) => {
                  setPasswordConfirmation(event.target.value);
                  clearPasswordMismatch();
                }}
                aria-invalid={confirmationMismatch || undefined}
                aria-describedby={confirmationMismatch ? 'account-error' : undefined}
              />
              <PasswordVisibilityToggle
                fieldId="confirm-password"
                label="confirmation password"
                show={showConfirmation}
                onToggle={() => setShowConfirmation(!showConfirmation)}
              />
            </div>
          </div>
        )}
        {error && (
          <p
            id="account-error"
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="rounded-inset bg-highlight-soft p-4 text-support text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            {retryingSignup ? signupFeedback : error}
          </p>
        )}
        <button className={`${primaryButton} w-full`} type="submit" disabled={submitDisabled}>
          {actionLabel}
        </button>
      </form>
      <p className="mt-3 text-center text-support text-muted">
        {register ? (
          <>
            Already have an account?{' '}
            <Link to={signInLink} className={`${textLink} ${textLinkTarget}`}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            Forgot your password? <SupportLink className={textLinkTarget}>Contact support</SupportLink>
          </>
        )}
      </p>
    </FormLayout>
  );
}

function PasswordVisibilityToggle({
  fieldId,
  label,
  show,
  onToggle,
}: Readonly<{
  fieldId: string;
  label: string;
  show: boolean;
  onToggle: () => void;
}>) {
  const action = show ? 'Hide' : 'Show';
  const Icon = show ? EyeOff : Eye;
  return (
    <button
      type="button"
      aria-label={`${action} ${label}`}
      aria-controls={fieldId}
      onClick={onToggle}
      className="pressable absolute inset-y-0 right-0 inline-flex min-h-12 w-[48px] items-center justify-center rounded-control text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon aria-hidden="true" size={20} />
    </button>
  );
}
