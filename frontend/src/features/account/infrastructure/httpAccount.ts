import type { AccountGateway, AccountProfile, Signup } from '../application/account';

type Csrf = { token: string; headerName: string };
let csrf: Csrf | null = null;

async function refreshCsrf(): Promise<Csrf> {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Please try again in a moment.');
  csrf = await response.json() as Csrf;
  return csrf;
}

async function post(path: string, values?: Record<string, string>): Promise<Response> {
  let response: Response;
  try {
    const token = csrf ?? await refreshCsrf();
    response = await fetch(path, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
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
    const detail = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(detail?.detail?.slice(0, 240) ?? 'Please wait a moment and try again.');
  }
  csrf = null;
  return response;
}

export const httpAccount: AccountGateway = {
  async current() {
    const response = await fetch('/api/v1/me', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('We could not load your account. Please try again.');
    return response.json() as Promise<AccountProfile>;
  },
  async register(input: Signup) {
    const response = await post('/api/v1/auth/register', {
      username: input.username, password: input.password, invitation: input.invitation,
      privacy: String(input.privacy), adult: String(input.adult),
    });
    return response.json() as Promise<AccountProfile>;
  },
  async signIn(username, password) {
    return (await post('/api/v1/auth/login', { username, password })).json() as Promise<AccountProfile>;
  },
  async signOut() { await post('/api/v1/auth/logout'); },
};
