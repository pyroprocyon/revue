import { isReviewTopic } from '../../../shared/navigation/paths';

/**
 * The learner's latest continuation in this open app. Browser storage can refuse a write, for example when it is
 * full, while reads still return an older value, so a refused write stays the answer until a later write succeeds.
 */
let latest: { username: string; topic: string | null; stored: boolean } | null = null;
const storageKey = (username: string) => `revue.paused-review.${username}`;

export function pausedReview(username: string): string | null {
  const known = latest?.username === username ? latest : null;
  if (known && !known.stored) return known.topic;
  try {
    const topic = localStorage.getItem(storageKey(username));
    return topic !== null && isReviewTopic(topic) ? topic : null;
  } catch {
    return known?.topic ?? null;
  }
}

export function rememberReview(username: string, topic: string): void {
  const stored = storageAccepted(() => localStorage.setItem(storageKey(username), topic));
  latest = { username, topic, stored };
}

export function forgetReview(username: string, topic: string): void {
  if (pausedReview(username) !== topic) return;
  const stored = storageAccepted(() => localStorage.removeItem(storageKey(username)));
  latest = { username, topic: null, stored };
}

function storageAccepted(write: () => void): boolean {
  try {
    write();
    return true;
  } catch {
    return false;
  }
}
