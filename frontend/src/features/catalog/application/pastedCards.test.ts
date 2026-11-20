import { describe, expect, it } from 'vitest';
import { cardProblems, formatPastedCards, needsFix, parsePastedCards } from './pastedCards';

describe('pasted cards', () => {
  it('reads blocks separated by blank lines, with the first line as the question and the rest as the answer', () => {
    const text =
      'What is osmosis?\nWater moving across a membrane.\n\n\nName two parts of a cell.\nNucleus\nMembrane\n';
    expect(parsePastedCards(text)).toEqual([
      { question: 'What is osmosis?', answer: 'Water moving across a membrane.' },
      { question: 'Name two parts of a cell.', answer: 'Nucleus\nMembrane' },
    ]);
  });

  it('reads Q: and A: labels in any case, with or without blank lines between cards', () => {
    const text =
      'Q: What is a strait?\nA: A narrow channel.\nq: Which part of the question\ncontinues here?\na:  This answer.';
    expect(parsePastedCards(text)).toEqual([
      { question: 'What is a strait?', answer: 'A narrow channel.' },
      { question: 'Which part of the question\ncontinues here?', answer: 'This answer.' },
    ]);
  });

  it('treats Windows line endings and lines of spaces like ordinary line breaks and blank lines', () => {
    expect(parsePastedCards('One?\r\n1\r\n   \t\r\nTwo?\r2')).toEqual([
      { question: 'One?', answer: '1' },
      { question: 'Two?', answer: '2' },
    ]);
  });

  it('keeps a block without an answer so the learner can fix it, and drops invisible null characters', () => {
    expect(parsePastedCards('What is a strait?\n\nWhat is\0 a bay?\nA wide inlet.')).toEqual([
      { question: 'What is a strait?', answer: '' },
      { question: 'What is a bay?', answer: 'A wide inlet.' },
    ]);
  });

  it('finds nothing in empty or blank text', () => {
    expect(parsePastedCards('')).toEqual([]);
    expect(parsePastedCards(' \n\n\t\n')).toEqual([]);
  });

  it('flags a missing or blank field, a question or answer over 500 characters and an explanation over 2,000', () => {
    expect(cardProblems({ question: '  ', answer: 'Answer' })).toEqual({
      question: 'missing',
      answer: null,
      explanation: null,
    });
    expect(cardProblems({ question: 'Question', answer: 'a'.repeat(501), explanation: 'e'.repeat(2001) })).toEqual({
      question: null,
      answer: 'too-long',
      explanation: 'too-long',
    });
    const longest = { question: ` ${'q'.repeat(500)} `, answer: 'Answer', explanation: ` ${'e'.repeat(2000)} ` };
    expect(needsFix(longest)).toBe(false);
  });

  it('writes edited cards back as labeled text, or as rows when a field holds a blank line or a labeled line', () => {
    const labeled = [
      { question: 'Name the steps.', answer: 'First\nSecond' },
      { question: 'What is missing?', answer: '' },
    ];
    expect(formatPastedCards(labeled)).toBe('Q: Name the steps.\nA: First\nSecond\n\nQ: What is missing?\nA: ');
    expect(parsePastedCards(formatPastedCards(labeled))).toEqual(labeled);

    const edited = [
      { question: 'Name the steps.', answer: 'First\n\nSecond' },
      { question: 'Read the dialogue.', answer: 'Hello\nQ: How are you?\nA: Fine' },
    ];
    expect(formatPastedCards(edited)).toBe(
      '#separator:tab\n#notetype:Revue\nName the steps.\t"First\n\nSecond"\nRead the dialogue.\t"Hello\nQ: How are you?\nA: Fine"',
    );
    expect(parsePastedCards(formatPastedCards(edited))).toEqual(edited);
  });
});

describe('pasted rows from a spreadsheet, Quizlet or Anki', () => {
  it('reads one card per tab-separated row, and a line without a tab continues the definition above it', () => {
    const quizletExport =
      'archipelago\tA group of islands\nstrait\tA narrow channel\nthat joins two seas\n\nbay\tA wide inlet';
    expect(parsePastedCards(quizletExport)).toEqual([
      { question: 'archipelago', answer: 'A group of islands' },
      { question: 'strait', answer: 'A narrow channel\nthat joins two seas' },
      { question: 'bay', answer: 'A wide inlet' },
    ]);
  });

  it('skips a row of column names, keeps further columns as the explanation and reads quoted spreadsheet cells', () => {
    const spreadsheet = [
      'Term\tDefinition\tNotes',
      '"Cell ""wall"""\t"Rigid layer\noutside the membrane"\tPlants only',
      'Organ\tGroup of tissues\t',
    ].join('\n');
    expect(parsePastedCards(spreadsheet)).toEqual([
      { question: 'Cell "wall"', answer: 'Rigid layer\noutside the membrane', explanation: 'Plants only' },
      { question: 'Organ', answer: 'Group of tissues' },
    ]);
  });

  it('keeps a title line above the rows as a card to fix, and text that only starts with a quote as typed', () => {
    expect(parsePastedCards('Latin phrases\n"Veni, vidi" is from\tCaesar\ncarpe diem\tseize the day')).toEqual([
      { question: 'Latin phrases', answer: '' },
      { question: '"Veni, vidi" is from', answer: 'Caesar' },
      { question: 'carpe diem', answer: 'seize the day' },
    ]);
  });

  it('reads blank-line blocks as before when only an answer line has a tab', () => {
    expect(parsePastedCards('Name the steps.\nFirst\tthen second\n\nWhat is a bay?\nA wide inlet.')).toEqual([
      { question: 'Name the steps.', answer: 'First\tthen second' },
      { question: 'What is a bay?', answer: 'A wide inlet.' },
    ]);
  });

  it('keeps numbered, bulleted, indented and labeled lines copied from a document as blocks', () => {
    expect(
      parsePastedCards('1.\tWhat is osmosis?\nWater moving across a membrane.\n\n2)\tWhat is diffusion?\nSpreading.'),
    ).toEqual([
      { question: '1.\tWhat is osmosis?', answer: 'Water moving across a membrane.' },
      { question: '2)\tWhat is diffusion?', answer: 'Spreading.' },
    ]);
    expect(parsePastedCards('Name four organelles.\n•\tNucleus\n•\tRibosome\n•\tVacuole\n•\tMitochondrion')).toEqual([
      { question: 'Name four organelles.', answer: '•\tNucleus\n•\tRibosome\n•\tVacuole\n•\tMitochondrion' },
    ]);
    expect(parsePastedCards('Name the steps.\n\tRinse.\n\tDry.\n\tStore.')).toEqual([
      { question: 'Name the steps.', answer: 'Rinse.\n\tDry.\n\tStore.' },
    ]);
    expect(parsePastedCards('Q:\tWhat is a strait?\nA:\tA narrow channel.')).toEqual([
      { question: 'What is a strait?', answer: 'A narrow channel.' },
    ]);
  });

  it('reads a card typed after a blank line below rows as its own card, so nothing merges into the row above', () => {
    const rows = 'Organ\tGroup of tissues\tBody part';
    expect(parsePastedCards(`${rows}\n\nWhat is a bay?\nA wide inlet.\n\nQ: What is a cell?\nA: Basic unit.`)).toEqual([
      { question: 'Organ', answer: 'Group of tissues', explanation: 'Body part' },
      { question: 'What is a bay?', answer: 'A wide inlet.' },
      { question: 'What is a cell?', answer: 'Basic unit.' },
    ]);
    expect(parsePastedCards('strait\tA channel.\n\nIt joins two seas.\nbay\tA wide inlet')).toEqual([
      { question: 'strait', answer: 'A channel.' },
      { question: 'It joins two seas.', answer: '' },
      { question: 'bay', answer: 'A wide inlet' },
    ]);
    expect(parsePastedCards(`${rows}\n\n1.\tWhat is a cell?\nThe basic unit of life.\n\n\tIndented?\n\tYes.`)).toEqual([
      { question: 'Organ', answer: 'Group of tissues', explanation: 'Body part' },
      { question: '1.\tWhat is a cell?', answer: 'The basic unit of life.' },
      { question: 'Indented?', answer: 'Yes.' },
    ]);
  });

  it('skips a first row naming its columns in English or Tagalog, even with an empty cell after it', () => {
    expect(parsePastedCards('Term\tDefinition\t\ncell\tbasic unit')).toEqual([
      { question: 'cell', answer: 'basic unit' },
    ]);
    expect(parsePastedCards('Tanong\tSagot\nAno ang pulo?\tIsla')).toEqual([
      { question: 'Ano ang pulo?', answer: 'Isla' },
    ]);
  });

  it('reads Anki’s export headers, turns its HTML into text, drops its tags column and flags removed media', () => {
    const ankiExport = [
      '#separator:tab',
      '#html:true',
      '#tags column:3',
      '<b>Heart</b> chambers?\tFour:<div>two atria</div><div>two&nbsp;ventricles &amp; septum</div>\tcardio',
      'Which valve?<img src="valve.jpg">\tMitral [sound:mitral.mp3]\tcardio',
      'List the layers\t<ul><li>Epicardium</li><li>Myocardium</li></ul>\tcardio',
    ].join('\n');
    expect(parsePastedCards(ankiExport)).toEqual([
      { question: 'Heart chambers?', answer: 'Four:\ntwo atria\ntwo ventricles & septum' },
      { question: 'Which valve?', answer: 'Mitral', removedMedia: ['image', 'audio'] },
      { question: 'List the layers', answer: '• Epicardium\n• Myocardium' },
    ]);
  });

  it('turns an Anki cloze row into one card per cloze number, with the other field as the explanation', () => {
    const cloze =
      '#html:true\n{{c1::Manila}} is the capital of the {{c2::Philippines::country}}.\tLargest city: Quezon City';
    const explanation = 'Largest city: Quezon City';
    expect(parsePastedCards(cloze)).toEqual([
      { question: '[...] is the capital of the Philippines.', answer: 'Manila', explanation },
      { question: 'Manila is the capital of the [country].', answer: 'Philippines', explanation },
    ]);
  });

  it('uses the separator Anki names, and reads HTML from an older Anki export without headers', () => {
    expect(parsePastedCards('#separator:Comma\n"Paris, France",capital\nLyon,city')).toEqual([
      { question: 'Paris, France', answer: 'capital' },
      { question: 'Lyon', answer: 'city' },
    ]);
    expect(parsePastedCards('Heart?\tFour<br>chambers\nLung?\t&lt;5 lobes&#33;')).toEqual([
      { question: 'Heart?', answer: 'Four\nchambers' },
      { question: 'Lung?', answer: '<5 lobes!' },
    ]);
  });

  it('writes cards with an explanation back as rows and reads them as typed, even when they look like Anki text', () => {
    const cards = [
      { question: 'Cell "wall"', answer: 'Rigid layer\noutside', explanation: 'Plants only' },
      { question: 'Organ', answer: '' },
    ];
    expect(formatPastedCards(cards)).toBe(
      '#separator:tab\n#notetype:Revue\nCell "wall"\t"Rigid layer\noutside"\tPlants only\nOrgan\t',
    );
    expect(parsePastedCards(formatPastedCards(cards))).toEqual(cards);
    const lookLikeAnkiOrHeadings = [
      { question: 'Question', answer: 'Answer', explanation: 'A row the reader could take for column names' },
      { question: '1.', answer: '<b>bold</b> &amp; more' },
      {
        question: 'How do I write {{c1::Paris}}?',
        answer: 'Use braces',
        explanation: 'Keep [sound:paris.mp3] as text',
      },
    ];
    expect(parsePastedCards(formatPastedCards(lookLikeAnkiOrHeadings))).toEqual(lookLikeAnkiOrHeadings);
    const headerFirst = [
      { question: '#tags: what does this header set?', answer: 'Nothing', explanation: 'It is a question' },
      { question: 'Second', answer: 'Two' },
    ];
    expect(parsePastedCards(formatPastedCards(headerFirst))).toEqual(headerFirst);
  });

  it('reads a spreadsheet row added below Edit text rows the same as a fresh paste, with every extra column', () => {
    const written = formatPastedCards([{ question: 'Heart rate?', answer: '60 to 100', explanation: 'Typical' }]);
    const row = 'Resting pulse?\t60\tAdult\tAt rest';
    expect(parsePastedCards(row)).toEqual([
      { question: 'Resting pulse?', answer: '60', explanation: 'Adult\nAt rest' },
    ]);
    expect(parsePastedCards(`${written}\n${row}`)).toEqual([
      { question: 'Heart rate?', answer: '60 to 100', explanation: 'Typical' },
      ...parsePastedCards(row),
    ]);
  });

  it('reads HTML only in the fields that hold it when rows don’t say, so plain comparisons stay as typed', () => {
    const headerless = [
      'Heart?\tFour<br>chambers',
      'Pressure?\t<table><tr><td>120</td><td>80</td></tr></table>',
      'Angle?\t90&deg;',
      'Compare\tA < B and C > D',
      'Less?\ta<b',
      'Condition?\tx<a && y>b',
      'Type?\tList<A>',
      'Link?\t<a href="https://example.com">site</a>',
      'Ratio?\t5<hr>10',
      'Snippets?\t<pre>return x</pre><pre>return y</pre>',
    ].join('\n');
    expect(parsePastedCards(headerless)).toEqual([
      { question: 'Heart?', answer: 'Four\nchambers' },
      { question: 'Pressure?', answer: '120 | 80' },
      { question: 'Angle?', answer: '90°' },
      { question: 'Compare', answer: 'A < B and C > D' },
      { question: 'Less?', answer: 'a<b' },
      { question: 'Condition?', answer: 'x<a && y>b' },
      { question: 'Type?', answer: 'List<A>' },
      { question: 'Link?', answer: 'site' },
      { question: 'Ratio?', answer: '5\n10' },
      { question: 'Snippets?', answer: 'return x\nreturn y' },
    ]);
    expect(parsePastedCards('#html:true\nCompare\tA < B and C > D')).toEqual([
      { question: 'Compare', answer: 'A < B and C > D' },
    ]);
  });

  it('keeps the first note of an Anki export even when its fields look like column names', () => {
    expect(parsePastedCards('#separator:tab\n#html:false\nTanong\tQuestion\nSagot\tAnswer')).toEqual([
      { question: 'Tanong', answer: 'Question' },
      { question: 'Sagot', answer: 'Answer' },
    ]);
  });

  it('decodes every HTML entity and keeps table cells apart', () => {
    const ankiExport = [
      '#html:true',
      'Right angle?\t90&deg; &mdash; &frac12; of 180&deg;',
      'Normal pressure?\t<table><tr><th>Systolic</th><th>Diastolic</th></tr><tr><td>120</td><td>80</td></tr></table>',
      'Hidden?\tShown<style>.x { color: red }</style><script>alert(1)</script>',
    ].join('\n');
    expect(parsePastedCards(ankiExport)).toEqual([
      { question: 'Right angle?', answer: '90° — ½ of 180°' },
      { question: 'Normal pressure?', answer: 'Systolic | Diastolic\n120 | 80' },
      { question: 'Hidden?', answer: 'Shown' },
    ]);
  });

  it('turns each number of a nested or shared cloze into its own card, and leaves an unclosed cloze as text', () => {
    expect(parsePastedCards('#html:true\n{{c1::Canberra was {{c2::founded::verb}}}} in 1913\tAustralia')).toEqual([
      { question: '[...] in 1913', answer: 'Canberra was founded', explanation: 'Australia' },
      { question: 'Canberra was [verb] in 1913', answer: 'founded', explanation: 'Australia' },
    ]);
    expect(parsePastedCards('#html:false\n{{c1::Paris}} and {{c1,2::Lyon}} are in France\tFrance')).toEqual([
      { question: '[...] and [...] are in France', answer: 'Paris, Lyon', explanation: 'France' },
      { question: 'Paris and [...] are in France', answer: 'Lyon', explanation: 'France' },
    ]);
    expect(parsePastedCards('#html:false\n{{c1::Manila is {{c2::open\tAnswer')).toEqual([
      { question: '{{c1::Manila is {{c2::open', answer: 'Answer' },
    ]);
  });
});
