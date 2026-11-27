import {
  ACCOUNT_PATH,
  LIBRARY_PATH,
  NEW_DECK_PATH,
  PUBLISHED_PATH,
  REVIEW_PATH,
  SETS_PATH,
  TODAY_PATH,
  isPositiveLongId,
  isReviewTopic,
} from '../../../shared/navigation/paths';
import type { DailyNewCardLimit } from '../../../shared/product/studyRules';

export type AccountProfile = { username: string };
export type Signup = { username: string; password: string };
export type StudySettings = { dailyNewCardLimit: DailyNewCardLimit };

export class SignupRateLimitedError extends Error {
  constructor(readonly retryDeadline: number | null) {
    super('Signup is busy. Please try again.');
  }
}

export interface AccountGateway {
  prepareWrite: (this: void) => void;
  signedIn: (signal?: AbortSignal) => Promise<boolean>;
  current: (signal?: AbortSignal) => Promise<AccountProfile | null>;
  studySettings: (signal?: AbortSignal) => Promise<StudySettings>;
  saveStudySettings: (settings: StudySettings) => Promise<StudySettings>;
  register: (input: Signup) => Promise<AccountProfile>;
  signIn: (username: string, password: string) => Promise<AccountProfile>;
  signOut: () => Promise<void>;
}

const PRIVATE_RETURN_PATHS: ReadonlySet<string> = new Set([
  LIBRARY_PATH,
  NEW_DECK_PATH,
  PUBLISHED_PATH,
  TODAY_PATH,
  REVIEW_PATH,
  ACCOUNT_PATH,
]);
const DECK_PREFIX = `${LIBRARY_PATH}/decks/`;
const SET_PREVIEW_PREFIX = `${SETS_PATH}/`;
const MAX_RETURN_PATH_LENGTH = 128;
const MAX_WORKSPACE_RETURN_PATH_LENGTH = 2_048;

const browseQueryKeys = new Set(['subject', 'subjectSearch', 'q', 'view']);
const savedCardQueryKeys = new Set(['cardQuery', 'cardDue', 'cardAfter']);
const libraryQueryKeys = new Set(['shelf', 'set', 'setStatus', 'q', 'after', ...savedCardQueryKeys]);

function validWorkspaceQuery(base: string, params: URLSearchParams): boolean {
  const allowedKeys = base === LIBRARY_PATH ? libraryQueryKeys : browseQueryKeys;
  const shelf = params.get('shelf');
  const set = params.get('set');
  for (const [key, value] of params) {
    if (!allowedKeys.has(key) || params.getAll(key).length > 1 || !value || /\p{Cc}/u.test(value)) return false;
    if (savedCardQueryKeys.has(key) && !set) return false;
    if ((key === 'set' || key === 'after' || key === 'cardAfter') && !isPositiveLongId(value)) return false;
  }
  if (base === PUBLISHED_PATH) return !params.has('view') || params.get('view') === 'stack';
  return (
    (shelf === null || shelf === 'mine' || shelf === 'saved') &&
    (!set || shelf === 'saved') &&
    (!params.has('setStatus') || params.get('setStatus') === 'paused') &&
    (!params.has('cardDue') || params.get('cardDue') === '1')
  );
}

function safeWorkspaceReturnPath(path: string, queryStart: number): string | null {
  if (path.length > MAX_WORKSPACE_RETURN_PATH_LENGTH || path.includes('#')) return null;
  const base = path.slice(0, queryStart);
  if (base !== LIBRARY_PATH && base !== PUBLISHED_PATH) return null;

  const params = new URLSearchParams(path.slice(queryStart + 1));
  if (!validWorkspaceQuery(base, params)) return null;
  return params.size ? `${base}?${params}` : base;
}

export function safeAccountReturnPath(path: string | null): string | null {
  if (path === null) return null;
  const queryStart = path.indexOf('?');
  if (queryStart >= 0) return safeWorkspaceReturnPath(path, queryStart);
  if (path.length > MAX_RETURN_PATH_LENGTH) return null;
  if (PRIVATE_RETURN_PATHS.has(path)) return path;
  if (path.startsWith(`${REVIEW_PATH}/`)) {
    const [topic, mode, extra] = path.slice(REVIEW_PATH.length + 1).split('/');
    return isReviewTopic(topic) && (mode === undefined || mode === 'start') && extra === undefined ? path : null;
  }
  if (path.startsWith(DECK_PREFIX)) return /^[1-9]\d*(\/paste)?$/.test(path.slice(DECK_PREFIX.length)) ? path : null;
  if (!path.startsWith(SET_PREVIEW_PREFIX)) return null;
  return isSetKey(path.slice(SET_PREVIEW_PREFIX.length)) ? path : null;
}

function isSetKey(key: string): boolean {
  return key.split('-').every((word) => /^[a-z0-9]+$/.test(word));
}
