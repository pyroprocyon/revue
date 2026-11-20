import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { Query } from '@tanstack/react-query';
import type { LibraryGateway } from '../application/library';

const LibraryContext = createContext<LibraryGateway | null>(null);

const ListRefetchOnMount = createContext<(query: Pick<Query, 'state' | 'isStaleByTime'>) => boolean>(() => true);

export function useListRefetchOnMount() {
  return useContext(ListRefetchOnMount);
}

export function LibraryProvider({ gateway, children }: Readonly<{ gateway: LibraryGateway; children: ReactNode }>) {
  const lastReturn = useRef(0);
  useEffect(() => {
    let away = document.visibilityState !== 'visible';
    function leave() {
      away = true;
    }
    function refreshOnNextVisit() {
      lastReturn.current = Date.now();
    }
    function visibilityChanged() {
      if (document.visibilityState !== 'visible') leave();
      else if (away) {
        away = false;
        refreshOnNextVisit();
      }
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', visibilityChanged);
    window.addEventListener('online', refreshOnNextVisit);
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', visibilityChanged);
      window.removeEventListener('online', refreshOnNextVisit);
    };
  }, []);
  const refetchListOnMount = useCallback((query: Pick<Query, 'state' | 'isStaleByTime'>) => {
    const { status, dataUpdatedAt } = query.state;
    return (
      status !== 'success' ||
      dataUpdatedAt <= lastReturn.current ||
      dataUpdatedAt > Date.now() ||
      query.isStaleByTime(30_000)
    );
  }, []);
  return (
    <LibraryContext value={gateway}>
      <ListRefetchOnMount value={refetchListOnMount}>{children}</ListRefetchOnMount>
    </LibraryContext>
  );
}

export function useLibraryGateway(): LibraryGateway {
  const gateway = useContext(LibraryContext);
  if (gateway === null) throw new Error('LibraryProvider is required');
  return gateway;
}
