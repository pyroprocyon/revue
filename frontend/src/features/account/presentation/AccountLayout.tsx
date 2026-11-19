import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { safeAccountReturnPath } from '../application/account';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { lastConfirmedProfile, rememberConfirmedProfile } from './confirmedProfile';
import {
  bindWritesTo,
  onConfirmedWrite,
  onOutdatedPage,
  onSessionMismatch,
} from '../../../shared/http/sameOriginRequest';
import { loadPage } from '../../../shared/navigation/pageLoads';
import { TODAY_PATH, signInPath } from '../../../shared/navigation/paths';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { RouteErrorBoundary, RouteErrorCard } from '../../../shared/ui/RouteError';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { StudyLayout } from '../../../shared/ui/StudyLayout';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspaceLayout } from '../../../shared/ui/WorkspaceLayout';
import { FocusRequestContext, InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';

type Session = { status: 'loading' | 'signed-out' } | { status: 'ready'; profile: AccountProfile };

const OUTDATED_REVIEW_MESSAGE = 'Your last change wasn’t sent. Go to Today to keep studying.';
const OUTDATED_PAGE_MESSAGE =
  'Your last change wasn’t sent. Copy anything you typed, then go to Today. If your decks are missing there, they’re still saved, and you can edit them again once they’re back.';

/**
 * Private routes mount only for an account the server confirmed. Returning to the tab, a write rejected for an old
 * session, or opening a private page from the last confirmed account rechecks the session quietly while private
 * controls are paused.
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
  const [outdated, setOutdated] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const learner = session.status === 'ready' ? session.profile.username : null;
  const lastUsername = useRef(learner ?? undefined);
  const privateContent = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);
  const requestFocus = useCallback((target: HTMLElement | null) => {
    if (privateContent.current?.inert) pendingFocus.current = target;
    else target?.focus();
  }, []);

  useEffect(() => {
    bindWritesTo(learner);
    return () => bindWritesTo(null);
  }, [learner]);

  useEffect(() => {
    const stopHearingOutdated = onOutdatedPage(() => setOutdated(true));
    const stopHearingConfirmed = onConfirmedWrite(() => setOutdated(false));
    return () => {
      stopHearingOutdated();
      stopHearingConfirmed();
    };
  }, []);

  // This effect comes before the session check on purpose. On mount it finds nothing to restore,
  // so it cannot drop the focus that the first check of a remembered account records right after.
  useEffect(() => {
    if (checking || verificationError) return;
    const requested = pendingFocus.current;
    const focusTarget = requested ?? previousFocus.current;
    pendingFocus.current = null;
    previousFocus.current = null;
    if (focusTarget && document.activeElement === document.body && privateContent.current?.contains(focusTarget)) {
      focusTarget.focus({ preventScroll: requested === null });
    }
  }, [checking, verificationError]);

  useEffect(() => {
    let pendingRequest: symbol | undefined;
    async function checkSession() {
      if (pendingRequest) return;
      const request = Symbol();
      pendingRequest = request;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && privateContent.current?.contains(activeElement)) {
        previousFocus.current = activeElement;
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
    function recheckAfterSessionMismatch() {
      // A check already in flight can have read the account from before a sign-in in another tab.
      invalidateSessionCheck();
      checkVisibleSession();
    }
    void checkSession();
    const stopHearingMismatches = onSessionMismatch(recheckAfterSessionMismatch);
    window.addEventListener('focus', checkVisibleSession);
    window.addEventListener('blur', invalidateSessionCheck);
    document.addEventListener('visibilitychange', checkVisibleSession);
    return () => {
      invalidateSessionCheck();
      stopHearingMismatches();
      window.removeEventListener('focus', checkVisibleSession);
      window.removeEventListener('blur', invalidateSessionCheck);
      document.removeEventListener('visibilitychange', checkVisibleSession);
    };
  }, [attempt, gateway, queryClient]);

  if (session.status === 'signed-out') {
    return <Navigate to={signInPath(safeAccountReturnPath(location.pathname))} replace />;
  }

  // Out of date, every private write is refused. A review pauses with it, while workspace pages and their open forms
  // stay usable, so the learner can copy text they haven’t sent.
  const outdatedReview = outdated && focused;
  const interactionsPaused = checking || verificationError || outdatedReview;
  const noticeLevel = session.status === 'ready' ? 'h2' : 'h1';
  const content = (
    <>
      {checking && session.status === 'loading' && (
        <WhenSlow>
          <output className="mb-4 block text-muted">Loading your account…</output>
        </WhenSlow>
      )}
      {verificationError && (
        <AccountNotice
          level={noticeLevel}
          title="Your account couldn’t load"
          message="Check your connection and try again."
          action="Try again"
          onAction={() => setAttempt((value) => value + 1)}
        />
      )}
      {outdated && (
        <AccountNotice
          level={noticeLevel}
          title="Revue changed while this page was open"
          message={outdatedReview ? OUTDATED_REVIEW_MESSAGE : OUTDATED_PAGE_MESSAGE}
          action="Go to Today"
          onAction={() => loadPage(TODAY_PATH)}
        />
      )}
      {/* Preserve same-account drafts during verification; a different account starts fresh. */}
      {session.status === 'ready' && (
        <div ref={privateContent} inert={interactionsPaused} className={outdatedReview ? 'opacity-50' : undefined}>
          <InteractionPausedContext value={interactionsPaused}>
            <FocusRequestContext value={requestFocus}>
              <RouteErrorBoundary resetKey={location.pathname} fallback={<RouteErrorCard signedIn />}>
                <Outlet key={session.profile.username} context={session.profile} />
              </RouteErrorBoundary>
            </FocusRequestContext>
          </InteractionPausedContext>
        </div>
      )}
    </>
  );
  return focused ? (
    <StudyLayout top={<HomeLink to={TODAY_PATH} compact />} wide>
      <div className="pt-2 sm:pt-6">{content}</div>
    </StudyLayout>
  ) : (
    <WorkspaceLayout navigationDisabled={interactionsPaused}>{content}</WorkspaceLayout>
  );
}

function AccountNotice({
  level: Heading,
  title,
  message,
  action,
  onAction,
}: Readonly<{ level: 'h1' | 'h2'; title: string; message: string; action: string; onAction: () => void }>) {
  return (
    <section className="mb-6 rounded-card bg-surface p-compact-gutter shadow-card sm:p-6">
      <Heading className="text-title font-extrabold tracking-tight">{title}</Heading>
      <p role="alert" className="mt-3 text-body text-muted">
        {message}
      </p>
      <button type="button" onClick={onAction} className={`${primaryButton} mt-6`}>
        {action}
      </button>
    </section>
  );
}
