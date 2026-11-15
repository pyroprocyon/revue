export const libraryKeys = {
  all: ['library'] as const,
  lists: ['library', 'list'] as const,
  listsOf: (username: string) => ['library', 'list', username] as const,
  page: (username: string, after?: string) => ['library', 'list', username, after] as const,
  membership: (setId: string) => ['library', 'membership', setId] as const,
};

export const reviewKeys = {
  all: ['reviews'] as const,
  today: (username: string) => ['reviews', username, 'today'] as const,
  batch: (username: string, visit: string) => ['reviews', username, 'batch', visit] as const,
};
