import type { AccountGateway, AccountProfile, Signup } from '../application/account';
import {
  csrfToken,
  forgetCsrfToken,
  prepareCsrfToken,
  sameOriginRequest,
} from '../../../shared/http/sameOriginRequest';

const SESSION_CHECK_FAILED = 'We could not check your session. Please try again.';
const ACCOUNT_LOAD_FAILED = 'We could not load your account. Please try again.';
const REQUEST_UNCONFIRMED = 'We could not confirm the request. Check your connection, then try signing in.';

async function post(path: string, values?: Record<string, string>): Promise<Response> {
  let response: Response;
  try {
    const { headerName, token } = await csrfToken();
    response = await sameOriginRequest(path, {
      method: 'POST',
      headers: { [headerName]: token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
    });
  } catch {
    throw new Error(REQUEST_UNCONFIRMED);
  }
  if (!response.ok) {
    if (response.status === 403) {
      forgetCsrfToken();
      throw new Error('Your form expired. Please try again.');
    }
    const detail = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(detail?.detail?.slice(0, 240) ?? 'Please wait a moment and try again.');
  }
  forgetCsrfToken();
  return response;
}

async function postForProfile(path: string, values: Record<string, string>): Promise<AccountProfile> {
  const response = await post(path, values);
  try {
    return (await response.json()) as AccountProfile;
  } catch {
    throw new Error(REQUEST_UNCONFIRMED);
  }
}

export const httpAccount: AccountGateway = {
  prepareWrite: prepareCsrfToken,
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
    return postForProfile('/api/v1/auth/register', {
      username: input.username,
      password: input.password,
      invitation: input.invitation,
    });
  },
  async signIn(username, password) {
    return postForProfile('/api/v1/auth/login', { username, password });
  },
  async signOut() {
    await post('/api/v1/auth/logout');
  },
};
