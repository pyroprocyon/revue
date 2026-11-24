import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigationType, useSearchParams } from 'react-router';
import { safeAccountReturnPath } from '../features/account/application/account';
import { useAccountGateway } from '../features/account/presentation/AccountProvider';
import { forgetConfirmedProfile } from '../features/account/presentation/confirmedProfile';
import { SIGN_IN_PATH, TODAY_PATH } from '../shared/navigation/paths';
import { PublicSessionContext, publicSessionKey, usePublicSession } from '../shared/navigation/publicSession';
import { onSessionChange, sessionRevision } from '../shared/navigation/sessionChanges';
import { saveSignedInHint } from '../shared/navigation/signedInHint';
import { SessionCheckScreen } from '../shared/ui/MessageScreen';
import { RouteErrorBoundary, RouteErrorPage } from '../shared/ui/RouteError';

/** Gives public pages session-aware navigation while private pages confirm access at their own boundary. */
export function PublicSessionLayout() {
  const gateway = useAccountGateway();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigationType = useNavigationType();
  const revision = sessionRevision();
  const redirect = location.state as { signedOutRevision?: string | null } | null;
  const reuseSignedOutCheck =
    location.pathname === SIGN_IN_PATH &&
    navigationType === 'REPLACE' &&
    revision !== undefined &&
    redirect?.signedOutRevision === revision;
  const session = useQuery({
    queryKey: publicSessionKey,
    queryFn: ({ signal }) => gateway.signedIn(signal),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    initialData: reuseSignedOutCheck ? false : undefined,
    refetchOnMount: !reuseSignedOutCheck,
  });
  useEffect(() => {
    let observedRevision = revision;
    const filter = { queryKey: publicSessionKey, exact: true };
    function refreshSession() {
      void queryClient.cancelQueries(filter).then(() => queryClient.invalidateQueries(filter));
    }
    function checkRevision() {
      const currentRevision = sessionRevision();
      if (currentRevision === observedRevision) return;
      observedRevision = currentRevision;
      refreshSession();
    }
    const stop = onSessionChange(checkRevision, refreshSession);
    checkRevision();
    return stop;
  }, [queryClient, revision]);
  // A network failure during revalidation retains the last confirmed navigation. A signed-out response clears it.
  const confirmedStatus = session.data ? 'signed-in' : 'signed-out';
  const status = session.isPending ? 'checking' : confirmedStatus;
  const signedOutConfirmed = session.data === false;
  // A private page must not reopen from an account the server has just reported as signed out.
  useEffect(() => {
    if (signedOutConfirmed) forgetConfirmedProfile(queryClient);
  }, [signedOutConfirmed, queryClient]);
  // A failed check has no answer, so it keeps the hint from the last confirmed one.
  const confirmedSignedIn = session.data;
  useEffect(() => {
    if (confirmedSignedIn !== undefined) saveSignedInHint(confirmedSignedIn);
  }, [confirmedSignedIn]);
  return (
    <PublicSessionContext value={status}>
      <RouteErrorBoundary resetKey={location.pathname} fallback={<RouteErrorPage signedIn={status === 'signed-in'} />}>
        <Outlet />
      </RouteErrorBoundary>
    </PublicSessionContext>
  );
}

export function GuestRoute() {
  const session = usePublicSession();
  const [search] = useSearchParams();
  if (session === 'checking') return <SessionCheckScreen />;
  if (session === 'signed-in') {
    return <Navigate to={safeAccountReturnPath(search.get('returnTo')) ?? TODAY_PATH} replace />;
  }
  return <Outlet />;
}
