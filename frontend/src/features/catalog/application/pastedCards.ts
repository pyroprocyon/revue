import { CARD_FIELD_MAX_LENGTH } from './decks';
import { readPastedBlocks } from './pastedBlocks';
import { noConvertedFields, type ConvertedFields } from './ankiFields';
import { readPastedRows, writePastedRows } from './pastedRows';

/** The server refuses larger imports, so the preview stops at the same count. */
export const MAX_CARDS_PER_IMPORT = 200;
const LABELED_LINE = /^\s*[qa]:/i;

export type RemovedMedia = 'image' | 'audio';
export type PastedCard = { question: string; answer: string; explanation?: string; removedMedia?: RemovedMedia[] };
export type FieldProblem = 'missing' | 'too-long';
export type CardProblems = {
  question: FieldProblem | null;
  answer: FieldProblem | null;
  explanation: 'too-long' | null;
};

/**
 * Splits pasted notes into cards. Rows from a spreadsheet, Quizlet or Anki read one card per row; other text reads as
 * blocks separated by blank lines, with optional "Q:" and "A:" labels.
 */
export function parsePastedCards(text: string, converted: ConvertedFields = noConvertedFields()): PastedCard[] {
  const cleanText = withoutNullCharacters(text);
  return readPastedRows(cleanText, converted) ?? readPastedBlocks(cleanText);
}

/** Pasted text can carry invisible null characters, which the server refuses. */
function withoutNullCharacters(text: string) {
  return text.replaceAll('\0', '');
}

export function cardProblems(card: PastedCard): CardProblems {
  const explanation = card.explanation?.trim() ?? '';
  return {
    question: fieldProblem(card.question, CARD_FIELD_MAX_LENGTH.question),
    answer: fieldProblem(card.answer, CARD_FIELD_MAX_LENGTH.answer),
    explanation: explanation.length > CARD_FIELD_MAX_LENGTH.explanation ? 'too-long' : null,
  };
}

export function needsFix(card: PastedCard) {
  return Object.values(cardProblems(card)).some((problem) => problem !== null);
}

function fieldProblem(text: string, maxLength: number): FieldProblem | null {
  const trimmed = text.trim();
  if (trimmed === '') return 'missing';
  return trimmed.length > maxLength ? 'too-long' : null;
}

/**
 * Writes cards back as text that `parsePastedCards` reads as the same cards: labeled text, which is easier to edit,
 * when every card fits it, and rows otherwise.
 */
export function formatPastedCards(cards: PastedCard[]): string {
  if (!cards.every(fitsLabeledText)) return writePastedRows(cards);
  return cards.map((card) => `Q: ${card.question.trim()}\nA: ${card.answer.trim()}`).join('\n\n');
}

/** Labeled text has no explanation, a tab would make it rows, and a blank or labeled line inside a field splits a card. */
function fitsLabeledText(card: PastedCard) {
  return !card.explanation?.trim() && fitsLabeledField(card.question) && fitsLabeledField(card.answer);
}

function fitsLabeledField(field: string) {
  const trimmed = field.trim();
  const [, ...laterLines] = trimmed.split('\n');
  return !trimmed.includes('\t') && laterLines.every((line) => line.trim() !== '' && !LABELED_LINE.test(line));
}

/**
 * Text written by `formatPastedCards` has no media left in it. So a card read back from that text keeps the mark of the
 * card it was written from, as long as the learner hasn't changed its text. Cards with the same text take their marks
 * in order, so each copy keeps its own.
 */
export function withRemovedMediaFrom(writtenCards: PastedCard[], cards: PastedCard[]): PastedCard[] {
  const mediaByText = new Map<string, (RemovedMedia[] | undefined)[]>();
  for (const card of writtenCards) {
    const copies = mediaByText.get(cardText(card));
    if (copies) copies.push(card.removedMedia);
    else mediaByText.set(cardText(card), [card.removedMedia]);
  }
  return cards.map((card) => {
    const removedMedia = card.removedMedia ?? mediaByText.get(cardText(card))?.shift();
    return removedMedia ? { ...card, removedMedia } : card;
  });
}

function cardText({ question, answer, explanation = '' }: PastedCard) {
  return JSON.stringify([question.trim(), answer.trim(), explanation.trim()]);
}
