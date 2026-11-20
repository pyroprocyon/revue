export type RouteState = {
  sessionExpired?: boolean;
  signedOutRevision?: string | null;
  fromLibrary?: boolean;
  fromPublished?: boolean;
  trialPreviewKey?: string;
  fromSavedSetList?: boolean;
  fromHelp?: boolean;
  fromWorkspace?: boolean;
  previousCursors?: (string | undefined)[];
  savedCardCursors?: (string | undefined)[];
  deletedDeckTitle?: string;
  createdDeck?: boolean;
  importedCards?: number;
};

export const OPENED_FROM_LIBRARY: RouteState = { fromLibrary: true };
export const OPENED_FROM_PUBLISHED: RouteState = { fromPublished: true };
export const OPENED_FROM_HELP: RouteState = { fromHelp: true };
export const CREATED_DECK: RouteState = { createdDeck: true };
export const OPENED_FROM_WORKSPACE: RouteState = { fromWorkspace: true };

export function previousCursorsState(previousCursors: (string | undefined)[]): RouteState {
  return { previousCursors };
}

export function deletedDeckState(deletedDeckTitle: string): RouteState {
  return { deletedDeckTitle };
}

export function importedCardsState(importedCards: number): RouteState {
  return { importedCards };
}

export function routeState(location: { state: unknown }): RouteState {
  return (location.state ?? {}) as RouteState;
}
