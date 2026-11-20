import { cardsFromFields, type ConvertedHtml } from './ankiFields';
import { readPastedBlocks } from './pastedBlocks';
import type { PastedCard } from './pastedCards';

/**
 * With header lines, every line with a separator is a note: an Anki export, or rows that Edit text wrote. Rows pasted
 * without them are inferred, so each line is checked.
 */
type RowSource = 'anki' | 'revue' | 'inferred';
type RowLayout = {
  source: RowSource;
  separator: string;
  /** Null when the text doesn't say, so each field decides. */
  html: boolean | null;
  skippedColumns: Set<number>;
  body: string;
};
type RowOrBlock = { row: string[] } | { lines: string[] };

const TAB = '\t';
const REVUE_NOTE_TYPE = 'Revue';
const WRITTEN_ROWS_HEADER = `#separator:tab\n#notetype:${REVUE_NOTE_TYPE}`;
const ANKI_HEADER =
  /^#(separator|html|tags|columns|notetype|deck|notetype column|deck column|tags column|guid column):(.*)$/i;
const COLUMN_NAMES = new Set([
  'question',
  'questions',
  'answer',
  'answers',
  'term',
  'terms',
  'definition',
  'definitions',
  'front',
  'back',
  'explanation',
  'notes',
  'word',
  'meaning',
  'tanong',
  'sagot',
]);
/** Word and Google Docs copy a numbered or bulleted line as its marker, a tab, then the text. */
const LIST_MARKER = /^\s*(\(?(\d{1,3}|[a-z]|[ivx]{1,4})[.)]|[•◦▪‣·*–-]|[qa]:)\s*$/i;
const SEPARATOR_NAMES: Record<string, string> = {
  comma: ',',
  semicolon: ';',
  tab: TAB,
  space: ' ',
  pipe: '|',
  colon: ':',
};

/**
 * Reads cards pasted as rows: tab-separated rows copied from a spreadsheet or exported from Quizlet, or Anki's
 * plain-text export with its header lines. The first column is the question, the second the answer and any others the
 * explanation. Returns null for text that isn't rows, which then reads as blank-line blocks.
 */
export function readPastedRows(text: string, convertedHtml: ConvertedHtml): PastedCard[] | null {
  const layout = headerLayout(text) ?? tabLayout(text);
  if (!layout) return null;
  const records = readRecords(layout.body, layout.separator);
  const parts =
    layout.source === 'inferred'
      ? withoutColumnNames(rowsAndBlocks(records, isTabRow, layout.separator))
      : rowsAndBlocks(records, hasSeveralFields, layout.separator);
  return parts.flatMap((part) => {
    if (!('row' in part)) return readPastedBlocks(part.lines.join('\n'));
    const fields = part.row.filter((_, column) => !layout.skippedColumns.has(column));
    return layout.source === 'revue' ? [cardAsTyped(fields)] : cardsFromFields(fields, layout.html, convertedHtml);
  });
}

function cardAsTyped([question = '', answer = '', explanation = '']: string[]): PastedCard {
  const card = { question: question.trim(), answer: answer.trim() };
  return explanation.trim() ? { ...card, explanation: explanation.trim() } : card;
}

/** Anki 2.1.54 and later start a plain-text export with header lines such as "#separator:tab" and "#html:true". */
function headerLayout(text: string): RowLayout | null {
  const lines = text.split(/\r\n|\r|\n/);
  const layout: RowLayout = { source: 'anki', separator: TAB, html: null, skippedColumns: new Set(), body: '' };
  let headerLines = 0;
  for (const line of lines) {
    const header = ANKI_HEADER.exec(line.trim());
    if (!header) break;
    applyAnkiHeader(layout, header[1].toLowerCase(), header[2].trim());
    headerLines += 1;
  }
  if (headerLines === 0) return null;
  layout.body = lines.slice(headerLines).join('\n');
  return layout;
}

function applyAnkiHeader(layout: RowLayout, key: string, value: string) {
  if (key === 'separator') layout.separator = SEPARATOR_NAMES[value.toLowerCase()] ?? (value || TAB);
  else if (key === 'html') layout.html = value.toLowerCase() === 'true';
  else if (key === 'notetype' && value === REVUE_NOTE_TYPE) layout.source = 'revue';
  else if (key.endsWith(' column')) {
    const column = Number(value);
    if (Number.isInteger(column) && column > 0) layout.skippedColumns.add(column - 1);
  }
}

/**
 * Rows if the first line is a row, or most lines are, so a title line above the rows doesn't hide them. A tab after an
 * indent or a list marker doesn't make a row.
 */
function tabLayout(text: string): RowLayout | null {
  const lines = readRecords(text, TAB).filter((record) => record.length > 0);
  const rows = lines.filter(isTabRow).length;
  const isRows = lines.length > 0 && (isTabRow(lines[0]) || rows * 2 > lines.length);
  return isRows ? { source: 'inferred', separator: TAB, html: null, skippedColumns: new Set(), body: text } : null;
}

function isTabRow(record: string[]) {
  return hasSeveralFields(record) && record[0].trim() !== '' && !LIST_MARKER.test(record[0]);
}

function hasSeveralFields(record: string[]) {
  return record.length > 1;
}

/** A quoted field can hold separators and line breaks, as spreadsheets and Anki write them. A blank line is `[]`. */
function readRecords(text: string, separator: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let position = 0;
  for (;;) {
    const field = readField(text, position, separator);
    fields.push(field.text);
    position = field.end;
    if (text.startsWith(separator, position)) {
      position += separator.length;
      continue;
    }
    records.push(fields.some((value) => value.trim() !== '') ? fields : []);
    if (position >= text.length) return records;
    fields = [];
    position += text.startsWith('\r\n', position) ? 2 : 1;
  }
}

function readField(text: string, start: number, separator: string) {
  const quoted = text[start] === '"' ? readQuotedField(text, start, separator) : null;
  if (quoted) return quoted;
  let end = start;
  while (end < text.length && !text.startsWith(separator, end) && !isLineBreak(text[end])) end += 1;
  return { text: text.slice(start, end), end };
}

/** Null unless the closing quote ends the field, so text that merely starts with a quote stays as typed. */
function readQuotedField(text: string, start: number, separator: string) {
  let value = '';
  let position = start + 1;
  for (;;) {
    const quote = text.indexOf('"', position);
    if (quote === -1) return null;
    value += text.slice(position, quote);
    if (text[quote + 1] === '"') {
      value += '"';
      position = quote + 2;
      continue;
    }
    const end = quote + 1;
    const endsField = end === text.length || text.startsWith(separator, end) || isLineBreak(text[end]);
    return endsField ? { text: value, end } : null;
  }
}

function isLineBreak(character: string | undefined) {
  return character === '\n' || character === '\r';
}

/**
 * A line that isn't a row right under a row continues its last field, because an exported definition can span lines
 * unquoted. After a blank line, such lines are blocks: a text box can't take a typed tab, so that is how a learner adds
 * a card below rows.
 */
function rowsAndBlocks(records: string[][], isRow: (record: string[]) => boolean, separator: string): RowOrBlock[] {
  const parts: RowOrBlock[] = [];
  let open: RowOrBlock | undefined;
  for (const record of records) {
    if (record.length === 0) {
      open = undefined;
    } else if (isRow(record)) {
      open = { row: [...record] };
      parts.push(open);
    } else if (open) {
      appendLine(open, record.join(separator));
    } else {
      open = { lines: [record.join(separator)] };
      parts.push(open);
    }
  }
  return parts;
}

function appendLine(part: RowOrBlock, line: string) {
  if ('row' in part) part.row[part.row.length - 1] += `\n${line}`;
  else part.lines.push(line);
}

/** A spreadsheet often starts with a row naming its columns, such as "Question" and "Answer". */
function withoutColumnNames(parts: RowOrBlock[]): RowOrBlock[] {
  const [first, ...rest] = parts;
  if (first === undefined || !('row' in first)) return parts;
  const names = first.row.map((field) => field.trim().toLowerCase()).filter((field) => field !== '');
  return names.length > 1 && names.every((name) => COLUMN_NAMES.has(name)) ? rest : parts;
}

/**
 * Writes cards as tab-separated rows that `readPastedRows` reads back as the same cards. The header lines make every
 * row a note, and the Revue note type keeps each field as typed, so no row is taken for column names and no field for
 * HTML, a cloze or a sound tag.
 */
export function writePastedRows(cards: PastedCard[]): string {
  const rows = cards.map((card) => {
    const fields = card.explanation ? [card.question, card.answer, card.explanation] : [card.question, card.answer];
    return fields.map(quotedWhenNeeded).join(TAB);
  });
  return [WRITTEN_ROWS_HEADER, ...rows].join('\n');
}

function quotedWhenNeeded(field: string) {
  return /[\t\n\r]/.test(field) || field.startsWith('"') ? `"${field.replaceAll('"', '""')}"` : field;
}
