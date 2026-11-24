export const TRIAL_CARD_COUNT = 5;
export const REVIEW_BATCH_SIZE = 5;
export const DAILY_NEW_CARD_LIMIT = 10;
export const REVIEW_TIME_ZONE = 'Asia/Manila';
export const REVIEW_TIME_ZONE_OFFSET = '+08:00';

const studyDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: REVIEW_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function untilNextStudyDay() {
  const now = new Date();
  const midnight = new Date(`${studyDate.format(now)}T00:00:00${REVIEW_TIME_ZONE_OFFSET}`);
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  return midnight.getTime() - now.getTime();
}
