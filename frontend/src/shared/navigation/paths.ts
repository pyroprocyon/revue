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

export function signInPath(returnTo?: string | null): string {
  return returnTo ? `${SIGN_IN_PATH}?${new URLSearchParams({ returnTo })}` : SIGN_IN_PATH;
}

export const REGISTER_PATH = '/register';
export const JOIN_PATH = '/join';
export const ACCOUNT_PATH = '/account';
export const HELP_PATH = '/help';
export const PRIVACY_PATH = '/privacy';
export const TERMS_PATH = '/terms';

export const LIBRARY_PATH = '/library';
export const PUBLISHED_PATH = '/published';
export const NEW_DECK_PATH = '/library/decks/new';
export const DECK_ROUTE = '/library/decks/:deckId';

export function deckPath(deckId: string): string {
  return `/library/decks/${deckId}`;
}

export const TODAY_PATH = '/today';
export const REVIEW_PATH = '/review';
export const REVIEW_TOPIC_ROUTE = `${REVIEW_PATH}/:topic`;
export const START_TOPIC_ROUTE = `${REVIEW_TOPIC_ROUTE}/start`;

export function isReviewTopic(topic: string | undefined): topic is string {
  return topic !== undefined && /^(deck|set)-[1-9]\d{0,18}$/.test(topic);
}

export function reviewTopicPath(topic: string, includeNew = false): string {
  return `${REVIEW_PATH}/${topic}${includeNew ? '/start' : ''}`;
}

export function savedSetListParams(params: URLSearchParams) {
  const updated = new URLSearchParams(params);
  updated.delete('set');
  updated.delete('cardQuery');
  updated.delete('cardDue');
  updated.delete('cardAfter');
  return updated;
}
