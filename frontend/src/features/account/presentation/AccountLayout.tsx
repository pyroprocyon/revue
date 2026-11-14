import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { safeAccountReturnPath } from '../application/account';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { lastConfirmedProfile, rememberConfirmedProfile } from './confirmedProfile';
import { TODAY_PATH, SIGN_IN_PATH } from '../../../shared/navigation/paths';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { StudyLayout } from '../../../shared/ui/StudyLayout';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspaceLayout } from '../../../shared/ui/WorkspaceLayout';
import { FocusRequestContext } from '../../../shared/ui/FocusRequestContext';

type Session =
  | { status: 'loading' | 'signed-out' }
  | { status: 'ready'; profile: AccountProfile };

/**
 * Private routes mount only for an account the server confirmed. Returning to the tab, or opening a private page
 * from the last confirmed account, rechecks the session quietly while private controls are paused.
 */
export function AccountLayout({ focused = false }: Readonly<{ focused?: boolean }>) {
  const location = useLocation();
  const gateway = useAccountGateway();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session>(() => {
    const profile = lastConfirmedProfile(queryClient);
    return profile ? { status: 'ready', profile } : { status: 'loading' };
  });
  // A remembered account starts unpaused so its page can take route-entry focus. The first check pauses it at once.
  const [checking, setChecking] = useState(session.status === 'loading');
  const [verificationError, setVerificationError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastUsername = useRef(session.status === 'ready' ? session.profile.username : undefined);
  const privateContent = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);
  const requestFocus = useCallback((target: HTMLElement | null) => {
    if (privateContent.current?.inert) pendingFocus.current = target;
    else target?.focus();
  }, []);

  // This effect comes before the session check on purpose. On mount it finds nothing to restore,
  // so it cannot drop the focus that the first check of a remembered account records right after.
  useEffect(() => {
    if (checking || verificationError) return;
    const requested = pendingFocus.current;
    const focused = requested ?? previousFocus.current;
    pendingFocus.current = null;
    previousFocus.current = null;
    if (focused && document.activeElement === document.body && privateContent.current?.contains(focused)) {
      focused.focus({ preventScroll: requested === null });
    }
  }, [checking, verificationError]);

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
          pendingFocus.current = null;
          queryClient.clear();
        }
        lastUsername.current = profile?.username;
        if (profile !== null) rememberConfirmedProfile(queryClient, profile);
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

  if (session.status === 'signed-out') {
    const returnPath = safeAccountReturnPath(location.pathname);
    return <Navigate to={returnPath ? `${SIGN_IN_PATH}?${new URLSearchParams({ returnTo: returnPath })}` : SIGN_IN_PATH} replace />;
  }

  const ErrorHeading = session.status === 'ready' ? 'h2' : 'h1';
  const content = (
    <>
      {checking && session.status === 'loading' && (
        <WhenSlow><output className="mb-4 block text-muted">Loading your account…</output></WhenSlow>
      )}
      {verificationError && <section className="mb-6 rounded-card bg-surface p-compact-gutter shadow-card sm:p-6">
        <ErrorHeading className="text-title font-extrabold tracking-tight">Your account couldn’t load</ErrorHeading>
        <p role="alert" className="mt-3 text-body text-muted">Check your connection and try again.</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className={`${primaryButton} mt-6`}>Try again</button>
      </section>}
      {/* Preserve same-account drafts during verification; a different account starts fresh. */}
      {session.status === 'ready' && <div ref={privateContent} inert={checking || verificationError}>
        <FocusRequestContext value={requestFocus}>
          <Outlet key={session.profile.username} context={session.profile} />
        </FocusRequestContext>
      </div>}
    </>
  );
  return focused ? (
    <StudyLayout top={<HomeLink to={TODAY_PATH} compact />} wide>
      <div className="pt-2 sm:pt-6">{content}</div>
    </StudyLayout>
  ) : (
    <WorkspaceLayout navigationDisabled={checking || verificationError}>{content}</WorkspaceLayout>
  );
}
