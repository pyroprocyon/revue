import { createContext, useContext, type ReactNode } from 'react';
import type { LibraryGateway } from '../application/library';

const LibraryContext = createContext<LibraryGateway | null>(null);

export function LibraryProvider({ gateway, children }: Readonly<{ gateway: LibraryGateway; children: ReactNode }>) {
  return <LibraryContext value={gateway}>{children}</LibraryContext>;
}

export function useLibraryGateway(): LibraryGateway {
  const gateway = useContext(LibraryContext);
  if (gateway === null) throw new Error('LibraryProvider is required');
  return gateway;
}
