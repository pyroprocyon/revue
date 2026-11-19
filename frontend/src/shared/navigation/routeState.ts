type RouteState = {
  fromHelp?: boolean;
  fromWorkspace?: boolean;
  previousCursors?: (string | undefined)[];
  deletedDeckTitle?: string;
  createdDeck?: boolean;
};

export const OPENED_FROM_HELP: RouteState = { fromHelp: true };
export const CREATED_DECK: RouteState = { createdDeck: true };
export const OPENED_FROM_WORKSPACE: RouteState = { fromWorkspace: true };

export function previousCursorsState(previousCursors: (string | undefined)[]): RouteState {
  return { previousCursors };
}

export function deletedDeckState(deletedDeckTitle: string): RouteState {
  return { deletedDeckTitle };
}

export function routeState(location: { state: unknown }): RouteState {
  return (location.state ?? {}) as RouteState;
}
