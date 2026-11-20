import type { PastedCard, RemovedMedia } from './pastedCards';

type Field = { text: string; isHtml: boolean };
type Cloze = { numbers: number[]; content: ClozeText; hint: string };
type ClozeText = (string | Cloze)[];
type ClozeSpan = { numbers: number[]; contentStart: number; end: number };
/** Converted text of each HTML field, kept by the paste page while it is open. */
export type ConvertedHtml = Map<string, string>;

const TAG = /<\/?([a-z][a-z0-9]*)\b[^<>]*>/gi;
const FIELD_TAG_NAMES = new Set([
  'br',
  'div',
  'p',
  'span',
  'b',
  'i',
  'u',
  's',
  'em',
  'strong',
  'sub',
  'sup',
  'font',
  'a',
  'img',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'hr',
]);
const HTML_ENTITY_HINT = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});/i;
const SOUND_TAG = /\[sound:[^\]]*\]/g;
const IMAGE_TAG = /<img\b/i;
const TEXT_THAT_IS_NOT_SHOWN = 'script, style';
const BLOCK_ELEMENTS = 'div, p, ul, ol, li, tr, table, blockquote, h1, h2, h3, h4, h5, h6';
const CELLS_AFTER_A_CELL = 'td + td, td + th, th + td, th + th';
const CELL_SEPARATOR = ' | ';
const NO_BREAK_SPACE = /\u00a0/g;
const CLOZE_START = '{{c';
const CLOZE_CLOSING = '}}';
const HINT_SEPARATOR = '::';
/** Anki nests clozes inside clozes. The limit keeps hostile text from running the reader out of call stack. */
const MAX_CLOZE_DEPTH = 20;
const MAX_REMEMBERED_FIELDS = 10_000;

/** Exports from Anki before 2.1.54 have no header lines, but their fields still carry HTML. */
export function looksLikeHtml(field: string) {
  return HTML_ENTITY_HINT.test(field) || hasFieldTag(field);
}

function hasFieldTag(field: string) {
  for (const [, name] of field.matchAll(TAG)) {
    if (FIELD_TAG_NAMES.has(name.toLowerCase())) return true;
  }
  return false;
}

/**
 * Turns one exported row into cards. Images and audio are removed and recorded, because Revue cards are text. A cloze
 * row such as "{{c1::Manila}} is the capital" becomes one card per cloze number, and its other fields become the
 * explanation. When the export doesn't say whether it holds HTML, only fields that look like HTML are read as HTML, so a
 * plain answer such as "A < B" stays as typed.
 *
 * The paste box reads its whole text again on every keystroke, and parsing HTML made a 150,000-character Anki export
 * take about 40 ms each time in Chromium on November 20, 2026. `convertedHtml` lets each field convert once.
 */
export function cardsFromFields(texts: string[], html: boolean | null, convertedHtml: ConvertedHtml): PastedCard[] {
  const fields = texts.map((text) => ({ text, isHtml: html ?? looksLikeHtml(text) }));
  const removedMedia = mediaIn(fields);
  const [first = '', ...rest] = fields.map((field) => plainText(field, convertedHtml));
  const flagged = removedMedia.length > 0 ? { removedMedia } : {};
  const clozeText = readClozes(first);
  const clozeNumbers = [...new Set(numbersIn(clozeText))].sort((first, second) => first - second);
  if (clozeNumbers.length > 0) {
    const explanation = joinedExplanation(rest);
    return clozeNumbers.map((number) => ({
      question: questionHiding(clozeText, number),
      answer: textsHiddenBy(clozeText, number).join(', '),
      ...explanation,
      ...flagged,
    }));
  }
  const [answer = '', ...others] = rest;
  return [{ question: first, answer, ...joinedExplanation(others), ...flagged }];
}

function mediaIn(fields: Field[]): RemovedMedia[] {
  const media: RemovedMedia[] = [];
  if (fields.some((field) => field.isHtml && IMAGE_TAG.test(field.text))) media.push('image');
  if (fields.some((field) => field.text.includes('[sound:'))) media.push('audio');
  return media;
}

function plainText(field: Field, convertedHtml: ConvertedHtml) {
  const withoutSound = field.text.replaceAll(SOUND_TAG, '');
  return (field.isHtml ? htmlToText(withoutSound, convertedHtml) : withoutSound).trim();
}

function htmlToText(html: string, convertedHtml: ConvertedHtml) {
  const remembered = convertedHtml.get(html);
  if (remembered !== undefined) return remembered;
  const text = textOf(html);
  if (convertedHtml.size >= MAX_REMEMBERED_FIELDS) convertedHtml.clear();
  convertedHtml.set(html, text);
  return text;
}

/**
 * Anki starts each new line with "<div>", so block elements break lines, and table cells stay apart. A template's
 * content runs no scripts and loads no images. Blank lines are dropped, as in pasted fields.
 */
function textOf(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const body = template.content;
  for (const hidden of body.querySelectorAll(TEXT_THAT_IS_NOT_SHOWN)) hidden.remove();
  for (const lineBreak of body.querySelectorAll('br')) lineBreak.replaceWith('\n');
  for (const item of body.querySelectorAll('li')) item.prepend('• ');
  for (const cell of body.querySelectorAll(CELLS_AFTER_A_CELL)) cell.before(CELL_SEPARATOR);
  for (const block of body.querySelectorAll(BLOCK_ELEMENTS)) {
    block.before('\n');
    block.after('\n');
  }
  return (body.textContent ?? '')
    .replaceAll(NO_BREAK_SPACE, ' ')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .join('\n');
}

function joinedExplanation(fields: string[]): { explanation?: string } {
  const explanation = fields.filter((field) => field !== '').join('\n');
  return explanation === '' ? {} : { explanation };
}

function readClozes(text: string): ClozeText {
  if (!text.includes(CLOZE_START)) return [text];
  const spans = clozeSpans(text);
  return readClozeText(text, 0, text.length, spans);
}

/**
 * Anki pairs each "{{c1::" with the "}}" that closes it, so "{{c1::Canberra was {{c2::founded}}}}" holds two clozes. A
 * deletion such as "{{c1,2::Lyon}}" is hidden on cards 1 and 2.
 */
function clozeSpans(text: string): Map<number, ClozeSpan> {
  const opening = /\{\{c(\d+(?:,\d+)*)::/y;
  const spans = new Map<number, ClozeSpan>();
  const open: { start: number; numbers: number[]; contentStart: number }[] = [];
  let position = 0;
  while (position < text.length) {
    opening.lastIndex = position;
    const start = opening.exec(text);
    if (start) {
      open.push({ start: position, numbers: start[1].split(',').map(Number), contentStart: opening.lastIndex });
      position = opening.lastIndex;
      continue;
    }
    const closed = text.startsWith(CLOZE_CLOSING, position) ? open.pop() : undefined;
    if (closed === undefined) {
      position += 1;
      continue;
    }
    if (open.length < MAX_CLOZE_DEPTH) {
      spans.set(closed.start, { numbers: closed.numbers, contentStart: closed.contentStart, end: position });
    }
    position += CLOZE_CLOSING.length;
  }
  return spans;
}

function readClozeText(text: string, start: number, end: number, spans: Map<number, ClozeSpan>): ClozeText {
  const parts: ClozeText = [];
  let plainStart = start;
  let position = start;
  while (position < end) {
    const span = spans.get(position);
    if (span === undefined) {
      position += 1;
      continue;
    }
    if (position > plainStart) parts.push(text.slice(plainStart, position));
    parts.push(readCloze(text, span, spans));
    position = span.end + CLOZE_CLOSING.length;
    plainStart = position;
  }
  if (end > plainStart) parts.push(text.slice(plainStart, end));
  return parts;
}

function readCloze(text: string, span: ClozeSpan, spans: Map<number, ClozeSpan>): Cloze {
  const separator = hintSeparator(text, span, spans);
  return {
    numbers: span.numbers,
    content: readClozeText(text, span.contentStart, separator ?? span.end, spans),
    hint: separator === null ? '' : text.slice(separator + HINT_SEPARATOR.length, span.end),
  };
}

/** The first "::" outside the clozes nested in this one starts its hint, as in "{{c1::Manila::capital}}". */
function hintSeparator(text: string, span: ClozeSpan, spans: Map<number, ClozeSpan>): number | null {
  let position = span.contentStart;
  while (position < span.end) {
    const nested = spans.get(position);
    if (nested) position = nested.end + CLOZE_CLOSING.length;
    else if (text.startsWith(HINT_SEPARATOR, position)) return position;
    else position += 1;
  }
  return null;
}

function numbersIn(parts: ClozeText): number[] {
  return parts.flatMap((part) => (typeof part === 'string' ? [] : [...part.numbers, ...numbersIn(part.content)]));
}

function questionHiding(parts: ClozeText, number: number): string {
  return parts
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part.numbers.includes(number)) return `[${part.hint.trim() || '...'}]`;
      return questionHiding(part.content, number);
    })
    .join('');
}

function textsHiddenBy(parts: ClozeText, number: number): string[] {
  return parts.flatMap((part) => {
    if (typeof part === 'string') return [];
    if (part.numbers.includes(number)) return [shownText(part.content).trim()];
    return textsHiddenBy(part.content, number);
  });
}

function shownText(parts: ClozeText): string {
  return parts.map((part) => (typeof part === 'string' ? part : shownText(part.content))).join('');
}
