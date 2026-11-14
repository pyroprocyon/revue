export const SIGNED_IN_HINT_KEY = 'revue.signed-in-hint';

/**
 * Remembers in this browser whether the last confirmed session was signed in. The homepage reads
 * it only to decide whether to wait for the session check. It grants no access.
 */
export function saveSignedInHint(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT_KEY, 'true');
    else localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // Without browser storage the homepage treats every visitor as a guest until the check answers.
  }
}

export function hasSignedInHint() {
  try {
    return localStorage.getItem(SIGNED_IN_HINT_KEY) === 'true';
  } catch {
    return false;
  }
}
