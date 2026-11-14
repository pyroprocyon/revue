import type { QueryClient } from '@tanstack/react-query';
import type { AccountProfile } from '../application/account';

const confirmedProfileKey = ['account', 'confirmed-profile'] as const;

/**
 * Keeps the last account the server confirmed, so a later private page can open at once and recheck quietly.
 * It lives in the query cache. Sign-out, an expired session and an account change clear it with the cache.
 */
export function rememberConfirmedProfile(queryClient: QueryClient, profile: AccountProfile) {
  // No screen reads this entry while a public page is open, so it must not expire on its own.
  queryClient.setQueryDefaults(confirmedProfileKey, { gcTime: Infinity });
  queryClient.setQueryData(confirmedProfileKey, profile);
}

export function lastConfirmedProfile(queryClient: QueryClient) {
  return queryClient.getQueryData<AccountProfile>(confirmedProfileKey);
}

export function forgetConfirmedProfile(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: confirmedProfileKey, exact: true });
}
