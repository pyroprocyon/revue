import type { AccountGateway, AccountProfile, Signup } from '../application/account';
import { CSRF_PATH, sameOriginRequest, type CsrfToken } from '../../../shared/http/sameOriginRequest';

const SESSION_CHECK_FAILED = 'We could not check your session. Please try again.';
const ACCOUNT_LOAD_FAILED = 'We could not load your account. Please try again.';

let csrf: CsrfToken | null = null;

async function refreshCsrf(): Promise<CsrfToken> {
  const response = await sameOriginRequest(CSRF_PATH);
  if (!response.ok) throw new Error('Please try again in a moment.');
  csrf = (await response.json()) as CsrfToken;
  return csrf;
}

async function post(path: string, values?: Record<string, string>): Promise<Response> {
  let response: Response;
  try {
    const token = csrf ?? (await refreshCsrf());
    response = await sameOriginRequest(path, {
      method: 'POST',
      headers: { [token.headerName]: token.token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
    });
  } catch {
    throw new Error('We could not confirm the request. Check your connection, then try signing in.');
  }
  if (!response.ok) {
    if (response.status === 403) {
      csrf = null;
      throw new Error('Your form expired. Please try again.');
    }
    const detail = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(detail?.detail?.slice(0, 240) ?? 'Please wait a moment and try again.');
  }
  csrf = null;
  return response;
}

export const httpAccount: AccountGateway = {
  async signedIn() {
    const response = await sameOriginRequest('/api/v1/auth/session');
    if (!response.ok) throw new Error(SESSION_CHECK_FAILED);
    const status = (await response.json()) as { signedIn?: unknown } | null;
    if (typeof status?.signedIn !== 'boolean') throw new Error(SESSION_CHECK_FAILED);
    return status.signedIn;
  },
  async current() {
    const response = await sameOriginRequest('/api/v1/me');
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(ACCOUNT_LOAD_FAILED);
    const profile = (await response.json()) as Partial<AccountProfile> | null;
    if (typeof profile?.username !== 'string') throw new Error(ACCOUNT_LOAD_FAILED);
    return { username: profile.username };
  },
  async register(input: Signup) {
    const response = await post('/api/v1/auth/register', {
      username: input.username,
      password: input.password,
      invitation: input.invitation,
    });
    return response.json() as Promise<AccountProfile>;
  },
  async signIn(username, password) {
    return (await post('/api/v1/auth/login', { username, password })).json() as Promise<AccountProfile>;
  },
  async signOut() {
    await post('/api/v1/auth/logout');
  },
};
