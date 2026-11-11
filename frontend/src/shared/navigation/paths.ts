// Browser routes. Only the home page, the set list and each set's preview may appear in search
// results; the backend's BrowserRouteFilter sends noindex for every other route.
export const HOME_PATH = '/';
export const HOW_IT_WORKS_PATH = '/how-it-works';
export const SETS_PATH = '/sets';
export const SET_ROUTE = '/sets/:setKey';
export const SET_SHARE_ROUTE = '/s/:shareCode';
export const INVITE_PATH = '/i';

export function setSharePath(shareCode: string): string {
  return `/s/${shareCode}`;
}
export const TRIAL_ROUTE = '/sets/:setKey/try';

export function setPath(setKey: string): string {
  return `${SETS_PATH}/${setKey}`;
}

export function trialPath(setKey: string): string {
  return `${setPath(setKey)}/try`;
}

export const SIGN_IN_PATH = '/sign-in';
export const REGISTER_PATH = '/register';
export const JOIN_PATH = '/join';
export const ACCOUNT_PATH = '/account';
