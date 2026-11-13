import { createContext, useContext } from 'react';

export type PublicSessionStatus = 'checking' | 'signed-in' | 'signed-out';

export const publicSessionKey = ['account', 'public-session'] as const;

export const PublicSessionContext = createContext<PublicSessionStatus>('signed-out');

export function usePublicSession() {
  return useContext(PublicSessionContext);
}
