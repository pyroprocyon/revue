import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatPastedCards, parsePastedCards, type PastedCard } from './pastedCards';

const RUNS = { seed: 20261119, numRuns: 300 };

const word = fc.stringMatching(/^[A-Za-z0-9?.,'()-]{1,12}$/);
const line = fc
  .array(word, { minLength: 1, maxLength: 6 })
  .map((words) => words.join(' '))
  .filter((text) => !/^[qa]:/i.test(text));
const field = fc.array(line, { minLength: 1, maxLength: 3 }).map((lines) => lines.join('\n'));
const card = fc.record({ question: line, answer: field });
const editedLine = fc.oneof(
  line,
  line.map((text) => `Q: ${text}`),
  line.map((text) => `a: ${text}`),
  fc.constant(''),
);
const editedField = fc
  .array(editedLine, { minLength: 1, maxLength: 4 })
  .map((lines) => lines.join('\n').trim())
  .filter((text) => text !== '');
const editedCard = fc.record({ question: editedField, answer: editedField });

function plainText(cards: PastedCard[]) {
  return cards.map((item) => `${item.question}\n${item.answer}`).join('\n\n');
}

describe('pasted cards, for generated notes', () => {
  it('reads every plain block back as the card it was written from', () => {
    fc.assert(
      fc.property(fc.array(card, { minLength: 1, maxLength: 20 }), (cards) => {
        expect(parsePastedCards(plainText(cards))).toEqual(cards);
      }),
      RUNS,
    );
  });

  it('reads rows written for cards with explanations back as typed, with tabs, quotes, line breaks and Anki markup', () => {
    const rowWord = fc.oneof(
      fc.stringMatching(/^[A-Za-z0-9?.,'"()-]{1,12}$/),
      fc.constantFrom('{{c1::Paris}}', '[sound:a.mp3]', '<b>bold</b>', '&amp;', 'Question'),
    );
    const rowField = fc
      .array(fc.tuple(fc.constantFrom(' ', '\t', '\n'), rowWord), { minLength: 1, maxLength: 6 })
      .map((parts) => parts.map(([gap, word], index) => (index === 0 ? word : gap + word)).join(''));
    const explained = fc.record({ question: rowField, answer: rowField, explanation: rowField });
    const maybeExplained = fc.record(
      { question: rowField, answer: rowField, explanation: rowField },
      { requiredKeys: ['question', 'answer'] },
    );
    fc.assert(
      fc.property(explained, fc.array(maybeExplained, { maxLength: 15 }), (first, rest) => {
        const cards = [first, ...rest];
        expect(parsePastedCards(formatPastedCards(cards))).toEqual(cards);
      }),
      RUNS,
    );
  });

  it('reads edited cards back as the same cards, including fields with blank lines and lines that start with a label', () => {
    fc.assert(
      fc.property(fc.array(editedCard, { minLength: 1, maxLength: 20 }), (cards) => {
        expect(parsePastedCards(formatPastedCards(cards))).toEqual(cards);
      }),
      RUNS,
    );
  });
});
