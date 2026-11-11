export type AccountProfile = { username: string };
export type Signup = { username: string; password: string; invitation: string };

export interface AccountGateway {
  current(): Promise<AccountProfile | null>;
  register(input: Signup): Promise<AccountProfile>;
  signIn(username: string, password: string): Promise<AccountProfile>;
  signOut(): Promise<void>;
}

export function safeAccountReturnPath(path: string | null): string | null {
  if (!path?.startsWith('/sets/') || path.length > 128) return null;
  const key = path.slice('/sets/'.length);
  return key.split('-').every((part) => part.length > 0 && [...part].every((character) => /[a-z0-9]/.test(character))) ? path : null;
}
