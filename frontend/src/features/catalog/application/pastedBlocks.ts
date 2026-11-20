import type { PastedCard } from './pastedCards';

const QUESTION_LABEL = /^\s*q:\s*/i;
const ANSWER_LABEL = /^\s*a:\s*/i;

/**
 * Reads cards written as blocks. Blank lines separate cards, and in each card the first line is the question and the
 * remaining lines are the answer. A card that starts with "Q:" keeps its question going until a line that starts with
 * "A:", and a new "Q:" line starts the next card even without a blank line.
 */
export function readPastedBlocks(text: string): PastedCard[] {
  return lineGroups(text).map(cardFromLines);
}

function lineGroups(text: string): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const blank = line.trim() === '';
    const startsLabeledCard = QUESTION_LABEL.test(line);
    if ((blank || startsLabeledCard) && current.length > 0) {
      groups.push(current);
      current = [];
    }
    if (!blank) current.push(line);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function cardFromLines(lines: string[]): PastedCard {
  const questionLineCount = QUESTION_LABEL.test(lines[0]) ? linesBeforeAnswerLabel(lines) : 1;
  const question = lines.slice(0, questionLineCount).join('\n').replace(QUESTION_LABEL, '');
  const answer = lines.slice(questionLineCount).join('\n').replace(ANSWER_LABEL, '');
  return { question: question.trim(), answer: answer.trim() };
}

function linesBeforeAnswerLabel(lines: string[]) {
  const answerLine = lines.findIndex((line, index) => index > 0 && ANSWER_LABEL.test(line));
  return answerLine === -1 ? 1 : answerLine;
}
