import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { safeAccountReturnPath } from '../application/account';
import type { AccountProfile } from '../application/account';
import { useAccountGateway } from './AccountProvider';
import { onSessionChange, sessionRevision } from '../../../shared/navigation/sessionChanges';
import {
  invalidateConfirmation,
  lastConfirmedProfile,
  recentConfirmationTime,
  rememberConfirmedProfile,
  withinSessionWindow,
} from './confirmedProfile';
import {
  bindWritesTo,
  forgetCsrfToken,
  onConfirmedWrite,
  onOutdatedPage,
  onSessionMismatch,
} from '../../../shared/http/sameOriginRequest';
import { loadPage } from '../../../shared/navigation/pageLoads';
import { SETS_PATH, TODAY_PATH, signInPath } from '../../../shared/navigation/paths';
import { HomeLink } from '../../../shared/ui/HeaderLinks';
import { LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { RouteErrorBoundary, RouteErrorCard } from '../../../shared/ui/RouteError';
import { primaryButton } from '../../../shared/ui/buttonStyles';
import { StudyLayout } from '../../../shared/ui/StudyLayout';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspaceLayout } from '../../../shared/ui/WorkspaceLayout';
import { FocusRequestContext, InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';
import { pendingLoginKey } from '../../../shared/cache/queryKeys';

type Session =
  | { status: 'loading' }
  | { status: 'signed-out'; revision: ReturnType<typeof sessionRevision> }
  | { status: 'ready'; profile: AccountProfile };

const OUTDATED_REVIEW_MESSAGE = 'Your last change wasn’t sent. Go to Today to keep studying.';
const OUTDATED_PAGE_MESSAGE =
  'Your last change wasn’t sent. Copy anything you typed, then go to Today. If your decks are missing there, they’re still saved, and you can edit them again once they’re back.';

/**
 * Private routes mount only for an account the server confirmed. A short tab switch can reuse that confirmation. Account changes in other
 * tabs and rejected sessions always require a fresh server response before private controls become active again.
 */
export function AccountLayout({
  focused = false,
  loadingHeader,
  pendingReads: PendingReads,
}: Readonly<{
  focused?: boolean;
  loadingHeader?: ReactNode;
  pendingReads?: React.ComponentType<{ username: string }>;
}>) {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingTab = useRef<{ from: string; to: string; learner: string | null } | null>(null);
  const gateway = useAccountGateway();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session>(() => {
    const profile = lastConfirmedProfile(queryClient);
    return profile ? { status: 'ready', profile } : { status: 'loading' };
  });
  // A remembered account starts unpaused so its page can take route-entry focus. The first check pauses it at once.
  const [checking, setChecking] = useState(
    () => session.status === 'loading' || document.visibilityState !== 'visible',
  );
  const [verificationError, setVerificationError] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const learner = session.status === 'ready' ? session.profile.username : null;
  const pendingLogin = queryClient.getQueryData<string>(pendingLoginKey);
  const lastUsername = useRef(learner ?? pendingLogin);
  const [reviewHeader, setReviewHeader] = useState<HTMLDivElement | null>(null);
  const privateContent = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);
  const requestFocus = useCallback((target: HTMLElement | null) => {
    if (privateContent.current?.inert) pendingFocus.current = target;
    else target?.focus();
  }, []);

  useEffect(() => {
    if (learner) queryClient.removeQueries({ queryKey: pendingLoginKey, exact: true });
  }, [learner, queryClient]);

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
    if (checking) return;
    const tab = pendingTab.current;
    pendingTab.current = null;
    if (
      tab &&
      !verificationError &&
      tab.learner === learner &&
      tab.from === location.key &&
      tab.to !== location.pathname + location.search + location.hash
    ) {
      void navigate(tab.to);
    }
  }, [checking, verificationError, learner, location.key, location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    let pendingRequest: { controller: AbortController; startedAt: number } | undefined;
    let leftSinceLastReturn = true;
    let revision = sessionRevision();
    let confirmedAt = recentConfirmationTime(queryClient, revision);
    async function checkSession() {
      confirmedAt = undefined;
      invalidateConfirmation(queryClient);
      pendingRequest?.controller.abort();
      const request = { controller: new AbortController(), startedAt: Date.now() };
      pendingRequest = request;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && privateContent.current?.contains(activeElement)) {
        previousFocus.current = activeElement;
      }
      setChecking(true);
      setVerificationError(false);
      try {
        const profile = await gateway.current(request.controller.signal);
        if (pendingRequest !== request) return;
        if (storedSessionChanged()) {
          recheckAfterSessionMismatch();
          return;
        }
        if (leftSinceLastReturn && !withinSessionWindow(request.startedAt)) {
          pendingRequest = undefined;
          checkVisibleSession();
          return;
        }
        if (profile !== null) confirmedAt = Date.now();
        if (lastUsername.current !== profile?.username || profile === null) {
          previousFocus.current = null;
          pendingFocus.current = null;
          queryClient.clear();
        }
        lastUsername.current = profile?.username;
        if (profile !== null) rememberConfirmedProfile(queryClient, profile, revision);
        setSession(profile === null ? { status: 'signed-out', revision } : { status: 'ready', profile });
      } catch {
        if (pendingRequest === request) {
          discardPendingLoginReads();
          setVerificationError(true);
        }
      } finally {
        if (pendingRequest === request) {
          pendingRequest = undefined;
          setChecking(false);
        }
      }
    }
    function canReuseRecentCheck() {
      return revision !== undefined && withinSessionWindow(pendingRequest?.startedAt ?? confirmedAt);
    }
    function storedSessionChanged() {
      return sessionRevision() !== revision;
    }
    function markForReturn() {
      leftSinceLastReturn = true;
    }
    function checkVisibleSession() {
      if (document.visibilityState !== 'visible') {
        markForReturn();
        return;
      }
      const returning = leftSinceLastReturn;
      leftSinceLastReturn = false;
      if (storedSessionChanged()) {
        recheckAfterSessionMismatch();
      } else if (returning && !canReuseRecentCheck()) {
        void checkSession();
      }
    }
    function discardPendingLoginReads() {
      if (!queryClient.getQueryData(pendingLoginKey)) return;
      queryClient.clear();
      lastUsername.current = undefined;
    }
    function recheckAfterSessionMismatch() {
      discardPendingLoginReads();
      revision = sessionRevision();
      pendingTab.current = null;
      forgetCsrfToken();
      void checkSession();
    }
    function restorePage(event: PageTransitionEvent) {
      if (event.persisted) checkVisibleSession();
    }
    const stopHearingChanges = onSessionChange(() => {
      if (storedSessionChanged()) recheckAfterSessionMismatch();
    }, recheckAfterSessionMismatch);
    checkVisibleSession();
    // A visible secondary window can open before it gains focus for the first time.
    if (!document.hasFocus()) leftSinceLastReturn = true;
    window.addEventListener('pagehide', markForReturn);
    window.addEventListener('pageshow', restorePage);
    const stopHearingMismatches = onSessionMismatch(recheckAfterSessionMismatch);
    window.addEventListener('focus', checkVisibleSession);
    window.addEventListener('blur', markForReturn);
    document.addEventListener('visibilitychange', checkVisibleSession);
    return () => {
      pendingRequest?.controller.abort();
      pendingRequest = undefined;
      pendingTab.current = null;
      stopHearingMismatches();
      stopHearingChanges();
      window.removeEventListener('pagehide', markForReturn);
      window.removeEventListener('pageshow', restorePage);
      window.removeEventListener('focus', checkVisibleSession);
      window.removeEventListener('blur', markForReturn);
      document.removeEventListener('visibilitychange', checkVisibleSession);
    };
  }, [attempt, gateway, queryClient]);

  if (session.status === 'signed-out') {
    const returnTo =
      safeAccountReturnPath(location.pathname + location.search) ?? safeAccountReturnPath(location.pathname);
    return <Navigate to={signInPath(returnTo)} replace state={{ signedOutRevision: session.revision }} />;
  }

  // Out of date, every private write is refused. A review pauses with it, while workspace pages and their open forms
  // stay usable, so the learner can copy text they haven’t sent.
  const outdatedReview = outdated && focused;
  const interactionsPaused = checking || verificationError || outdatedReview;
  const noticeLevel = session.status === 'ready' ? 'h2' : 'h1';
  const content = (
    <>
      {session.status === 'loading' && pendingLogin && !verificationError && PendingReads && (
        <PendingReads username={pendingLogin} />
      )}
      {checking && (
        <WhenSlow>
          <LoadingStatus
            className={
              session.status === 'loading'
                ? 'mb-4'
                : 'pointer-events-none fixed inset-x-[max(1rem,var(--phone-edge-gutter))] top-[max(0.5rem,var(--phone-edge-gutter))] z-20 mx-auto w-fit rounded-control bg-surface px-3 py-2 shadow-control'
            }
          >
            {session.status === 'loading' ? 'Loading your account…' : 'Checking your session…'}
          </LoadingStatus>
          {session.status === 'loading' && <NavigationLink to={SETS_PATH}>Browse reviewers</NavigationLink>}
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
              <RouteErrorBoundary resetKey={location.pathname + location.search} fallback={<RouteErrorCard signedIn />}>
                <Outlet key={session.profile.username} context={{ ...session.profile, reviewHeader }} />
              </RouteErrorBoundary>
            </FocusRequestContext>
          </InteractionPausedContext>
        </div>
      )}
    </>
  );
  return focused ? (
    <StudyLayout
      top={
        <>
          <div ref={setReviewHeader} className="active-review-header empty:hidden">
            {session.status === 'loading' && loadingHeader}
          </div>
          <HomeLink to={TODAY_PATH} compact />
        </>
      }
    >
      <div className="pt-2 sm:pt-6">{content}</div>
    </StudyLayout>
  ) : (
    <WorkspaceLayout
      navigationDisabled={verificationError}
      onTabWhileChecking={
        checking && session.status === 'ready'
          ? (to) => {
              pendingTab.current = { from: location.key, to, learner };
            }
          : undefined
      }
    >
      {content}
    </WorkspaceLayout>
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
