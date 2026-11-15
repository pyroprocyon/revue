import { ACCOUNT_PATH, LIBRARY_PATH, REVIEW_PATH, SETS_PATH, TODAY_PATH } from '../../../shared/navigation/paths';

export type AccountProfile = { username: string };
export type Signup = { username: string; password: string; invitation: string };

export interface AccountGateway {
  signedIn(): Promise<boolean>;
  current(): Promise<AccountProfile | null>;
  register(input: Signup): Promise<AccountProfile>;
  signIn(username: string, password: string): Promise<AccountProfile>;
  signOut(): Promise<void>;
}

const PRIVATE_RETURN_PATHS: ReadonlySet<string> = new Set([LIBRARY_PATH, TODAY_PATH, REVIEW_PATH, ACCOUNT_PATH]);
const SET_PREVIEW_PREFIX = `${SETS_PATH}/`;
const MAX_RETURN_PATH_LENGTH = 128;

export function safeAccountReturnPath(path: string | null): string | null {
  if (path === null) return null;
  if (PRIVATE_RETURN_PATHS.has(path)) return path;
  if (!path.startsWith(SET_PREVIEW_PREFIX) || path.length > MAX_RETURN_PATH_LENGTH) return null;
  return isSetKey(path.slice(SET_PREVIEW_PREFIX.length)) ? path : null;
}

function isSetKey(key: string): boolean {
  return key.split('-').every((word) => /^[a-z0-9]+$/.test(word));
}
