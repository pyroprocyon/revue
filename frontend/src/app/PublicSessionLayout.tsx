import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useSearchParams } from 'react-router';
import { safeAccountReturnPath } from '../features/account/application/account';
import { useAccountGateway } from '../features/account/presentation/AccountProvider';
import { ACCOUNT_PATH } from '../shared/navigation/paths';
import { PublicSessionContext, publicSessionKey, usePublicSession } from '../shared/navigation/publicSession';
import { LoadingScreen } from '../shared/ui/MessageScreen';

/** Gives public pages session-aware navigation while private pages confirm access at their own boundary. */
export function PublicSessionLayout() {
  const gateway = useAccountGateway();
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
  return <PublicSessionContext value={status}><Outlet /></PublicSessionContext>;
}

export function GuestRoute() {
  const session = usePublicSession();
  const [search] = useSearchParams();
  if (session === 'checking') return <LoadingScreen text="Checking your session…" />;
  if (session === 'signed-in') {
    return <Navigate to={safeAccountReturnPath(search.get('returnTo')) ?? ACCOUNT_PATH} replace />;
  }
  return <Outlet />;
}
