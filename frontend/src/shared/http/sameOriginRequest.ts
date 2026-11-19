const REQUEST_TIMEOUT_MS = 10_000;

const CSRF_PATH = '/api/v1/auth/csrf';
const LEARNER_HEADER = 'X-Revue-Learner';

type CsrfToken = { token: string; headerName: string; username?: string | null };

export function sameOriginRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

let currentToken: Promise<CsrfToken> | null = null;

async function readCsrfToken(): Promise<CsrfToken> {
  const response = await sameOriginRequest(CSRF_PATH);
  if (!response.ok) throw new Error(`CSRF token request answered ${response.status}`);
  return (await response.json()) as CsrfToken;
}

/** The server keeps one token until sign-in, sign-up or sign-out replaces it, so writes reuse it. */
export function csrfToken(): Promise<CsrfToken> {
  if (currentToken === null) {
    const request = readCsrfToken();
    currentToken = request;
    request.catch(() => {
      if (currentToken === request) currentToken = null;
    });
  }
  return currentToken;
}

export function prepareCsrfToken(): void {
  void csrfToken();
}

export function forgetCsrfToken(): void {
  currentToken = null;
}

let boundLearner: string | null = null;

export function bindWritesTo(username: string | null): void {
  boundLearner = username;
}

const writeOutcomes = new EventTarget();

function onWriteOutcome(outcome: 'mismatch' | 'outdated' | 'confirmed', listener: () => void): () => void {
  writeOutcomes.addEventListener(outcome, listener);
  return () => writeOutcomes.removeEventListener(outcome, listener);
}

export function onSessionMismatch(listener: () => void): () => void {
  return onWriteOutcome('mismatch', listener);
}

export function onOutdatedPage(listener: () => void): () => void {
  return onWriteOutcome('outdated', listener);
}

export function onConfirmedWrite(listener: () => void): () => void {
  return onWriteOutcome('confirmed', listener);
}

async function sessionSignedOut(): Promise<boolean> {
  try {
    const response = await sameOriginRequest('/api/v1/auth/session');
    if (!response.ok) return false;
    const { signedIn } = (await response.json()) as { signedIn: boolean };
    return !signedIn;
  } catch {
    return false;
  }
}

async function rejectedForSession(rejection: Response): Promise<Response> {
  forgetCsrfToken();
  writeOutcomes.dispatchEvent(new Event('mismatch'));
  return (await sessionSignedOut()) ? new Response(null, { status: 401 }) : rejection;
}

const outdatedPageRefusals = new WeakSet<Response>();

function refusedForOutdatedPage(): Response {
  forgetCsrfToken();
  writeOutcomes.dispatchEvent(new Event('outdated'));
  const refusal = new Response(null, { status: 403 });
  outdatedPageRefusals.add(refusal);
  return refusal;
}

export function isOutdatedPageRefusal(response: Response): boolean {
  return outdatedPageRefusals.has(response);
}

/**
 * A 404 from a private route can come from a server older than this page, as during a backend rollback, because that
 * server lacks the newer routes. A fresh token answer tells them apart, because an older server's names no learner.
 * That token is dropped, so the first write after the newer server returns fetches its own. When the check fails,
 * this rejects, so callers report an unknown result, not a missing item.
 */
export async function answeredByOlderServer(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;
  forgetCsrfToken();
  const older = (await csrfToken()).username === undefined;
  if (older) forgetCsrfToken();
  return older;
}

/**
 * Sends an unsafe request with the reused CSRF token. Sign-in, sign-up and sign-out replace the token, so a 403 means
 * it came from an earlier session, such as one replaced by a sign-in in another tab. A rejected or refused write is
 * never resent: the next one fetches a fresh token, and `onSessionMismatch` listeners recheck who is signed in. When
 * nobody is signed in any more, the answer becomes a 401.
 *
 * A write bound by `bindWritesTo` goes out only when the token names that learner, who is read before the token wait
 * because the layout can switch learners meanwhile. The write also names its learner, so the server refuses it after
 * a sign-in the token answer overlapped. A token without a learner comes from an older server, as in a backend
 * rollback, so the write is refused for `onOutdatedPage` listeners, as is a 404 that `answeredByOlderServer` traces
 * to that server. A bound write that succeeds tells `onConfirmedWrite` listeners, so a page can drop that warning. Public
 * pages stay unbound, because saving a public set carries no learner's text.
 */
export async function sameOriginWrite(
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
): Promise<Response> {
  const learner = boundLearner;
  const { headerName, token, username } = await csrfToken();
  if (learner !== null && username === undefined) return refusedForOutdatedPage();
  if (learner !== null && username !== learner) return rejectedForSession(new Response(null, { status: 403 }));
  const learnerHeader: Record<string, string> = learner === null ? {} : { [LEARNER_HEADER]: learner };
  const headers = { ...init.headers, ...learnerHeader, [headerName]: token };
  const response = await sameOriginRequest(path, { ...init, headers });
  if (response.status === 403) return rejectedForSession(response);
  if (learner === null) return response;
  if (await answeredByOlderServer(response)) return refusedForOutdatedPage();
  if (response.ok) writeOutcomes.dispatchEvent(new Event('confirmed'));
  return response;
}
