import { createContext, useContext, type ReactNode } from 'react';
import type { AccountGateway } from '../application/account';

const Context = createContext<AccountGateway | null>(null);
export function AccountProvider({ gateway, children }: { gateway: AccountGateway; children: ReactNode }) {
  return <Context value={gateway}>{children}</Context>;
}
export function useAccountGateway() {
  const gateway = useContext(Context);
  if (gateway === null) throw new Error('Account screens require a gateway');
  return gateway;
}
