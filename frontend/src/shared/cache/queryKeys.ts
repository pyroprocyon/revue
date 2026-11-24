export const pendingLoginKey = ['account', 'pending-login'] as const;

export const libraryKeys = {
  all: ['library'] as const,
  lists: ['library', 'list'] as const,
  listsOf: (username: string) => ['library', 'list', username] as const,
  page: (username: string, after?: string) => ['library', 'list', username, after] as const,
  membership: (setId: string) => ['library', 'membership', setId] as const,
};

const allDeckCardPages = (username: string) => ['decks', username, 'cards'] as const;
const deckCardPages = (username: string, deckId: string) => [...allDeckCardPages(username), deckId] as const;

export const deckKeys = {
  all: ['decks'] as const,
  list: (username: string) => ['decks', username, 'list'] as const,
  allCardPages: allDeckCardPages,
  cardPages: deckCardPages,
  cardPage: (username: string, deckId: string, query: { after?: string; search?: string; dueOnly?: boolean }) =>
    [...deckCardPages(username, deckId), query.search, query.dueOnly ?? false, query.after] as const,
};

export const reviewKeys = {
  all: ['reviews'] as const,
  today: (username: string) => ['reviews', username, 'today'] as const,
  topic: (username: string, topic: string, includeNew: boolean) =>
    ['reviews', username, 'today', topic, includeNew] as const,
  batch: (username: string, visit: string) => ['reviews', username, 'batch', visit] as const,
};
