import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router';
import { safeAccountReturnPath } from '../features/account/application/account';
import { useAccountGateway } from '../features/account/presentation/AccountProvider';
import { forgetConfirmedProfile } from '../features/account/presentation/confirmedProfile';
import { TODAY_PATH } from '../shared/navigation/paths';
import { PublicSessionContext, publicSessionKey, usePublicSession } from '../shared/navigation/publicSession';
import { saveSignedInHint } from '../shared/navigation/signedInHint';
import { LoadingScreen } from '../shared/ui/MessageScreen';

/** Gives public pages session-aware navigation while private pages confirm access at their own boundary. */
export function PublicSessionLayout() {
  const gateway = useAccountGateway();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: publicSessionKey,
    queryFn: () => gateway.signedIn(),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  });
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
  return <PublicSessionContext value={status}><Outlet /></PublicSessionContext>;
}

export function GuestRoute() {
  const session = usePublicSession();
  const [search] = useSearchParams();
  if (session === 'checking') return <LoadingScreen text="Checking your session…" />;
  if (session === 'signed-in') {
    return <Navigate to={safeAccountReturnPath(search.get('returnTo')) ?? TODAY_PATH} replace />;
  }
  return <Outlet />;
}
