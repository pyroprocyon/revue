const REQUEST_TIMEOUT_MS = 10_000;

export const CSRF_PATH = '/api/v1/auth/csrf';

export type CsrfToken = { token: string; headerName: string };

export function sameOriginRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...init,
  });
}
