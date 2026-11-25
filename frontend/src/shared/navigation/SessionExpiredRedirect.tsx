import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { forgetCsrfToken } from '../http/sameOriginRequest';
import { signInPath } from './paths';
import { publicSessionKey } from './publicSession';
import type { RouteState } from './routeState';

export function useSessionExpiredRedirect() {
  const client = useQueryClient();
  const navigate = useNavigate();

  return useCallback(
    (returnTo: string) => {
      client.removeQueries({ queryKey: publicSessionKey, exact: true });
      forgetCsrfToken();
      const state: RouteState = { sessionExpired: true };
      void navigate(signInPath(returnTo), { replace: true, state });
    },
    [client, navigate],
  );
}

export function SessionExpiredRedirect({ returnTo }: Readonly<{ returnTo: string }>) {
  const redirect = useSessionExpiredRedirect();
  useEffect(() => redirect(returnTo), [redirect, returnTo]);
  return null;
}
