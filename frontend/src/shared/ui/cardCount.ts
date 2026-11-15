const NON_BREAKING_SPACE = ' ';

export function cardNoun(count: number): string {
  return count === 1 ? 'card' : 'cards';
}

export function cardCountLabel(count: number): string {
  return `${count}${NON_BREAKING_SPACE}${cardNoun(count)}`;
}
