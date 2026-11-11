import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { PublicContentReader } from '../application/publicContent';
import { publicContentQueries } from '../application/publicContentQueries';

const ReaderContext = createContext<PublicContentReader | null>(null);

export function PublicContentProvider({ reader, children }: Readonly<{ reader: PublicContentReader; children: ReactNode }>) {
  return <ReaderContext value={reader}>{children}</ReaderContext>;
}

export function usePublicContentQueries() {
  const reader = useContext(ReaderContext);
  if (reader === null) throw new Error('Public content requires a reader');
  return useMemo(() => publicContentQueries(reader), [reader]);
}
