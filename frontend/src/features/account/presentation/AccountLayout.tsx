import { useQueryClient } from '@tanstack/react-query';
import { House, LibraryBig } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { safeAccountReturnPath } from '../application/account';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { ACCOUNT_PATH, HELP_PATH, LIBRARY_PATH, SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { accountLink, primaryButton } from '../../../shared/ui/buttonStyles';
import { WorkspaceLayout } from '../../../shared/ui/WorkspaceLayout';

type Session =
  | { status: 'loading' | 'signed-out' }
  | { status: 'ready'; profile: AccountProfile };

function workspaceLink({ isActive }: Readonly<{ isActive: boolean }>) {
  const base = 'pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-4 py-2 text-label font-semibold';
  return `${base} ${isActive ? 'bg-accent-soft text-accent-strong' : 'text-muted'}`;
}

/** Private routes mount only after the session is confirmed, including after returning to the tab. */
export function AccountLayout() {
  const location = useLocation();
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

  if (session.status === 'signed-out') {
    const returnPath = safeAccountReturnPath(location.pathname);
    return <Navigate to={returnPath ? `${SIGN_IN_PATH}?${new URLSearchParams({ returnTo: returnPath })}` : SIGN_IN_PATH} replace />;
  }

  const ErrorHeading = session.status === 'ready' ? 'h2' : 'h1';
  return (
    <WorkspaceLayout brand={<>
      <HomeLink to={ACCOUNT_PATH} />
      <Link to={HELP_PATH} className={`${accountLink} ml-auto`}>Help</Link>
    </>}>
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
        <nav aria-label="Your workspace" className="mb-8 flex flex-wrap gap-2 border-b border-line pb-4">
          <NavLink to={ACCOUNT_PATH} className={workspaceLink}><House aria-hidden="true" className="size-5 shrink-0" />Account</NavLink>
          <NavLink to={LIBRARY_PATH} className={workspaceLink}><LibraryBig aria-hidden="true" className="size-5 shrink-0" />Library</NavLink>
        </nav>
        <Outlet key={session.profile.username} context={session.profile} />
      </div>}
    </WorkspaceLayout>
  );
}
