type RouteState = {
  fromHelp?: boolean;
  fromWorkspace?: boolean;
  previousCursors?: (string | undefined)[];
};

export const OPENED_FROM_HELP: RouteState = { fromHelp: true };
export const OPENED_FROM_WORKSPACE: RouteState = { fromWorkspace: true };

export function previousCursorsState(previousCursors: (string | undefined)[]): RouteState {
  return { previousCursors };
}

export function routeState(location: { state: unknown }): RouteState {
  return (location.state ?? {}) as RouteState;
}
