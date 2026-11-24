import { announceSessionChange } from '../../../shared/navigation/sessionChanges';
import type { AccountGateway, AccountProfile, Signup, StudySettings } from '../application/account';
import { DAILY_NEW_CARD_LIMITS } from '../../../shared/product/studyRules';
import {
  csrfToken,
  forgetCsrfToken,
  prepareCsrfToken,
  sameOriginRequest,
  sameOriginWrite,
} from '../../../shared/http/sameOriginRequest';

const SESSION_CHECK_FAILED = 'We could not check your session. Please try again.';
const ACCOUNT_LOAD_FAILED = 'We could not load your account. Please try again.';
const REQUEST_UNCONFIRMED = 'We could not confirm the request. Check your connection, then try signing in.';
const STUDY_SETTINGS_PATH = '/api/v1/me/study-settings';

async function readStudySettings(response: Response): Promise<StudySettings> {
  if (!response.ok) throw new Error('Study settings request failed');
  const settings = (await response.json()) as Partial<StudySettings> | null;
  const dailyNewCardLimit = DAILY_NEW_CARD_LIMITS.find((limit) => limit === settings?.dailyNewCardLimit);
  if (dailyNewCardLimit === undefined) throw new Error('Invalid study settings response');
  return { dailyNewCardLimit };
}

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
  announceSessionChange();
  return response;
}

async function postForProfile(path: string, values: Record<string, string>): Promise<AccountProfile> {
  const response = await post(path, values);
  try {
    const profile = (await response.json()) as Partial<AccountProfile> | null;
    if (!profile || typeof profile.username !== 'string' || !profile.username) throw new Error(REQUEST_UNCONFIRMED);
    return { username: profile.username };
  } catch {
    throw new Error(REQUEST_UNCONFIRMED);
  }
}

export const httpAccount: AccountGateway = {
  prepareWrite: prepareCsrfToken,
  async signedIn(signal) {
    const response = await sameOriginRequest('/api/v1/auth/session', { signal });
    if (!response.ok) throw new Error(SESSION_CHECK_FAILED);
    const status = (await response.json()) as { signedIn?: unknown } | null;
    if (typeof status?.signedIn !== 'boolean') throw new Error(SESSION_CHECK_FAILED);
    return status.signedIn;
  },
  async current(signal) {
    const response = await sameOriginRequest('/api/v1/me', { signal });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(ACCOUNT_LOAD_FAILED);
    const profile = (await response.json()) as Partial<AccountProfile> | null;
    if (typeof profile?.username !== 'string') throw new Error(ACCOUNT_LOAD_FAILED);
    return { username: profile.username };
  },
  async studySettings(signal) {
    return readStudySettings(await sameOriginRequest(STUDY_SETTINGS_PATH, { signal }));
  },
  async saveStudySettings(settings) {
    return readStudySettings(
      await sameOriginWrite(STUDY_SETTINGS_PATH, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }),
    );
  },
  async register(input: Signup) {
    return postForProfile('/api/v1/auth/register', input);
  },
  async signIn(username, password) {
    return postForProfile('/api/v1/auth/login', { username, password });
  },
  async signOut() {
    await post('/api/v1/auth/logout');
  },
};
