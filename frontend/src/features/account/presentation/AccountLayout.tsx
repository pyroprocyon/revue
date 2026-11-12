import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { WorkspaceLayout } from '../../../shared/ui/WorkspaceLayout';

type Session =
  | { status: 'loading' | 'signed-out' }
  | { status: 'ready'; profile: AccountProfile };

/** Private routes mount only after the session is confirmed, including after returning to the tab. */
export function AccountLayout() {
  const gateway = useAccountGateway();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [checking, setChecking] = useState(true);
  const [verificationError, setVerificationError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastUsername = useRef<string | undefined>(undefined);
  const privateContent = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let pendingRequest: symbol | undefined;
    async function checkSession() {
      if (pendingRequest) return;
      const request = Symbol();
      pendingRequest = request;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && privateContent.current?.contains(focused)) {
        previousFocus.current = focused;
      }
      setChecking(true);
      setVerificationError(false);
      try {
        const profile = await gateway.current();
        if (pendingRequest !== request) return;
        if (lastUsername.current !== profile?.username || profile === null) {
          previousFocus.current = null;
          queryClient.clear();
        }
        lastUsername.current = profile?.username;
        setSession(profile === null ? { status: 'signed-out' } : { status: 'ready', profile });
      } catch {
        if (pendingRequest === request) setVerificationError(true);
      } finally {
        if (pendingRequest === request) {
          pendingRequest = undefined;
          setChecking(false);
        }
      }
    }
    function invalidateSessionCheck() {
      pendingRequest = undefined;
    }
    function checkVisibleSession() {
      if (document.visibilityState === 'visible') void checkSession();
      else invalidateSessionCheck();
    }
    void checkSession();
    window.addEventListener('focus', checkVisibleSession);
    window.addEventListener('blur', invalidateSessionCheck);
    document.addEventListener('visibilitychange', checkVisibleSession);
    return () => {
      invalidateSessionCheck();
      window.removeEventListener('focus', checkVisibleSession);
      window.removeEventListener('blur', invalidateSessionCheck);
      document.removeEventListener('visibilitychange', checkVisibleSession);
    };
  }, [attempt, gateway, queryClient]);

  useEffect(() => {
    if (checking || verificationError) return;
    const focused = previousFocus.current;
    previousFocus.current = null;
    if (focused && document.activeElement === document.body && privateContent.current?.contains(focused)) {
      focused.focus({ preventScroll: true });
    }
  }, [checking, verificationError]);

  if (session.status === 'signed-out') return <Navigate to={SIGN_IN_PATH} replace />;

  const ErrorHeading = session.status === 'ready' ? 'h2' : 'h1';
  return (
    <WorkspaceLayout brand={<HomeLink />}>
      {checking && (session.status === 'ready'
        ? <output className="absolute top-0 text-support text-muted">Checking session…</output>
        : <output className="mb-4 block text-muted">Loading your account…</output>)}
      {verificationError && <section className="mb-6 rounded-card bg-surface p-compact-gutter shadow-card sm:p-6">
        <ErrorHeading className="text-title font-extrabold tracking-tight">Your account couldn’t load</ErrorHeading>
        <p role="alert" className="mt-3 text-body text-muted">Check your connection and try again.</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className={`${primaryButton} mt-6`}>Try again</button>
      </section>}
      {/* Preserve same-account drafts during verification; a different account starts fresh. */}
      {session.status === 'ready' && <div ref={privateContent} inert={checking || verificationError}>
        <Outlet key={session.profile.username} context={session.profile} />
      </div>}
    </WorkspaceLayout>
  );
}
