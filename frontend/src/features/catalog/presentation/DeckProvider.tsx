import { createContext, useContext, type ReactNode } from 'react';
import type { DeckGateway } from '../application/decks';

const DeckContext = createContext<DeckGateway | null>(null);

export function DeckProvider({ gateway, children }: Readonly<{ gateway: DeckGateway; children: ReactNode }>) {
  return <DeckContext value={gateway}>{children}</DeckContext>;
}

export function useDeckGateway(): DeckGateway {
  const gateway = useContext(DeckContext);
  if (gateway === null) throw new Error('DeckProvider is required');
  return gateway;
}
