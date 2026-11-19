import { useState } from 'react';
import { Outlet, useOutletContext } from 'react-router';
import type { AccountProfile } from '../../account/application/account';

export type DeckGroup = 'active' | 'paused';

export type LibraryBrowsing = AccountProfile & {
  search: string;
  deckGroup: DeckGroup;
  openedDeckId: string | null;
  searchDecks: (search: string) => void;
  showDeckGroup: (group: DeckGroup) => void;
  rememberOpenedDeck: (id: string) => void;
};

export function LibraryBrowsingLayout() {
  const profile = useOutletContext<AccountProfile>();
  const [search, setSearch] = useState('');
  const [deckGroup, setDeckGroup] = useState<DeckGroup>('active');
  const [openedDeckId, setOpenedDeckId] = useState<string | null>(null);

  const browsing: LibraryBrowsing = {
    ...profile,
    search,
    deckGroup,
    openedDeckId,
    searchDecks(value) {
      setSearch(value);
      setOpenedDeckId(null);
    },
    showDeckGroup: setDeckGroup,
    rememberOpenedDeck: setOpenedDeckId,
  };
  return <Outlet context={browsing} />;
}
