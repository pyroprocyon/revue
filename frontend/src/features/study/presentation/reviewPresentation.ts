import { REVIEW_BATCH_SIZE, REVIEW_TIME_ZONE, REVIEW_TIME_ZONE_OFFSET } from '../../../shared/product/studyRules';
import { cardNoun } from '../../../shared/ui/cardCount';

export const statusPanel = 'rounded-card bg-surface p-compact-gutter py-6 shadow-control sm:p-8';

export function reviewAction(count: number) {
  if (count >= REVIEW_BATCH_SIZE) return `Start with ${REVIEW_BATCH_SIZE}`;
  return `Review ${count} ${cardNoun(count)}`;
}

export function nextReviewText(date: string) {
  const parsed = new Date(`${date}T00:00:00${REVIEW_TIME_ZONE_OFFSET}`);
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: REVIEW_TIME_ZONE,
  }).format(parsed);
}
