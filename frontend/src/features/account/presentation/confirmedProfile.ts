import type { QueryClient } from '@tanstack/react-query';
import type { AccountProfile } from '../application/account';
import { pendingLoginKey } from '../../../shared/cache/queryKeys';
import type { sessionRevision } from '../../../shared/navigation/sessionChanges';

const confirmedProfileKey = ['account', 'confirmed-profile'] as const;
const SESSION_FRESH_MS = 30_000;

type ConfirmedProfile = { profile: AccountProfile; revision: ReturnType<typeof sessionRevision> };

export function withinSessionWindow(time: number | undefined) {
  if (time === undefined) return false;
  const elapsed = Date.now() - time;
  return elapsed >= 0 && elapsed < SESSION_FRESH_MS;
}

/**
 * Keeps the last account the server confirmed, so a later private page can open at once and recheck quietly.
 * It lives in the query cache. Sign-out, an expired session and an account change clear it with the cache.
 */
export function rememberConfirmedProfile(
  queryClient: QueryClient,
  profile: AccountProfile,
  revision: ConfirmedProfile['revision'],
) {
  // No screen reads this entry while a public page is open, so it must not expire on its own.
  queryClient.setQueryDefaults(confirmedProfileKey, { gcTime: Infinity });
  queryClient.setQueryData<ConfirmedProfile>(confirmedProfileKey, { profile, revision });
}

export function lastConfirmedProfile(queryClient: QueryClient) {
  return queryClient.getQueryData<ConfirmedProfile>(confirmedProfileKey)?.profile;
}

export function recentConfirmationTime(queryClient: QueryClient, revision: ConfirmedProfile['revision']) {
  if (revision === undefined || document.visibilityState !== 'visible') return undefined;
  const confirmation = queryClient.getQueryState<ConfirmedProfile>(confirmedProfileKey);
  if (confirmation?.data?.revision !== revision || confirmation.isInvalidated) return undefined;
  return withinSessionWindow(confirmation.dataUpdatedAt) ? confirmation.dataUpdatedAt : undefined;
}

export function invalidateConfirmation(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: confirmedProfileKey, exact: true, refetchType: 'none' });
}

export function forgetConfirmedProfile(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: pendingLoginKey, exact: true });
  queryClient.removeQueries({ queryKey: confirmedProfileKey, exact: true });
}
