// Browser routes. Only the home page, the set list and each set's preview may appear in search
// results; the backend's BrowserRouteFilter sends noindex for every other route.
export const HOME_PATH = '/';
export const SETS_PATH = '/sets';
export const SET_ROUTE = '/sets/:setKey';
export const TRIAL_ROUTE = '/sets/:setKey/try';

export function setPath(setKey: string): string {
  return `${SETS_PATH}/${setKey}`;
}

export function trialPath(setKey: string): string {
  return `${setPath(setKey)}/try`;
}
