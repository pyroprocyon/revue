import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp, requestBodyJson } from '../../../test/renderApp';

type Card = { question: string; answer: string };
type ImportRequest = { cards: Card[]; key: string | null; learner: string | null };

const pastePage = '/library/decks/7/paste';
const MIXED_PASTE = `What is an archipelago?
A group of islands.

What is a strait?

Q: What is an isthmus?
A: A narrow strip of land.`;

function fakeDeckServer({
  answerImport,
  failedDeckLists = 0,
}: { answerImport?: (request: ImportRequest) => Response | Promise<Response>; failedDeckLists?: number } = {}) {
  let signedInAs = 'learner';
  let deckListsToFail = failedDeckLists;
  let stored: Card[] = [];
  const imports: ImportRequest[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (path === '/api/v1/auth/session') return jsonResponse(200, { signedIn: true });
    if (path === '/api/v1/me') return jsonResponse(200, { username: signedInAs });
    if (path === '/api/v1/auth/csrf')
      return jsonResponse(200, { token: 'csrf', headerName: 'X-XSRF-TOKEN', username: signedInAs });
    if (path === '/api/v1/me/saved-sets') return jsonResponse(200, { items: [], nextCursor: null });
    const deck = { id: '7', title: 'Philippine geography', cardCount: stored.length, archived: false };
    if (path === '/api/v1/decks') {
      if (deckListsToFail > 0) {
        deckListsToFail -= 1;
        return jsonResponse(503);
      }
      return jsonResponse(200, { items: signedInAs === 'learner' ? [deck] : [] });
    }
    if (path.split('?')[0] === '/api/v1/decks/7/cards') {
      const items = stored.map((card, index) => ({
        ...card,
        id: String(index + 1),
        explanation: null,
        memoryHook: null,
        source: null,
        contentVersion: 1,
      }));
      const progress = { dueCards: 0, newCards: stored.length, nextReviewDate: null };
      return jsonResponse(200, { deck, progress, items, dueCardIds: [], nextCursor: null });
    }
    if (method === 'POST' && path === '/api/v1/decks/7/import') {
      const headers = new Headers(init?.headers);
      const request = {
        cards: (requestBodyJson(init) as { cards: Card[] }).cards,
        key: headers.get('Idempotency-Key'),
        learner: headers.get('X-Revue-Learner'),
      };
      imports.push(request);
      if (request.learner !== signedInAs) return jsonResponse(403);
      if (answerImport) return answerImport(request);
      stored = [...stored, ...request.cards];
      return jsonResponse(201, { deckId: '7', importedCards: request.cards.length });
    }
    return jsonResponse(404);
  });
  vi.stubGlobal('fetch', fetcher);
  return {
    imports,
    savedCards: () => stored,
    signInElsewhereAs(username: string) {
      signedInAs = username;
    },
  };
}

function count(cards: number, noun: 'card' | 'cards') {
  return `${cards}\u00a0${noun}`;
}

function spoken(element: HTMLElement) {
  return element.textContent?.replaceAll('\u00a0', ' ');
}

async function paste(text: string) {
  await screen.findByRole('link', { name: 'Philippine geography' });
  fireEvent.change(screen.getByLabelText('Your text'), { target: { value: text } });
}

function previewRow(name: RegExp) {
  return screen.getByRole('button', { name });
}

describe('paste import', () => {
  it('counts the pasted cards, opens the incomplete one and imports the fixed cards in one request', async () => {
    const server = fakeDeckServer();
    renderApp(pastePage);
    await paste(MIXED_PASTE);
    expect(screen.getByText('3 cards found')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(3, 'cards')}` }));

    expect(await screen.findByRole('heading', { name: 'Preview cards', level: 1 })).toBe(document.activeElement);
    expect(screen.getByRole('button', { name: 'Card 2 of 3' }).getAttribute('aria-expanded')).toBe('true');
    const answer = screen.getByLabelText('Answer');
    expect(answer.getAttribute('aria-invalid')).toBe('true');
    expect(answer.getAttribute('aria-describedby')).toContain(screen.getByText('Add an answer.').id);
    expect(previewRow(/^Card 3, What is an isthmus\? A narrow strip of land\.$/).getAttribute('aria-expanded')).toBe(
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: `Import ${count(3, 'cards')}` }));
    expect(server.imports).toHaveLength(0);
    expect(document.activeElement).toBe(answer);

    fireEvent.change(answer, { target: { value: 'A narrow channel of water.' } });
    expect(screen.getByText('Ready')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: `Import ${count(3, 'cards')}` }));

    expect(await screen.findByText('3 cards imported.')).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'Philippine geography', level: 1 })).toBeDefined();
    expect(server.imports).toEqual([
      {
        cards: [
          { question: 'What is an archipelago?', answer: 'A group of islands.' },
          { question: 'What is a strait?', answer: 'A narrow channel of water.' },
          { question: 'What is an isthmus?', answer: 'A narrow strip of land.' },
        ],
        key: expect.stringMatching(/^[0-9a-f-]{36}$/),
        learner: 'learner',
      },
    ]);
    expect(await screen.findByRole('button', { name: /What is a strait\?/ })).toBeDefined();
  });

  it('offers Explanation for a pasted answer over 300 characters, so its extra details can move there', async () => {
    const server = fakeDeckServer();
    renderApp(pastePage);
    const keyIdea = 'Typhoons form over warm ocean water.';
    const details = ' They draw energy from the heat and moisture.'.repeat(7);
    await paste(`What powers a typhoon?\t${keyIdea}${details}`);
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(1, 'card')}` }));
    await screen.findByRole('heading', { name: 'Preview cards' });

    const answer = screen.getByLabelText('Answer');
    expect(screen.getByText('Shorten the answer to 300 characters.')).toBeDefined();
    expect(answer.getAttribute('aria-describedby')).toContain(
      screen.getByText(/Move extra details to Explanation\.$/).id,
    );
    fireEvent.change(answer, { target: { value: keyIdea } });
    fireEvent.change(screen.getByLabelText('Explanation'), { target: { value: details.trim() } });
    fireEvent.click(screen.getByRole('button', { name: `Import ${count(1, 'card')}` }));

    expect(await screen.findByText('1 card imported.')).toBeDefined();
    expect(server.imports[0].cards).toEqual([
      { question: 'What powers a typhoon?', answer: keyIdea, explanation: details.trim() },
    ]);
  });

  it('removes a card from the import, offers Undo in its place and counts what will be saved', async () => {
    const server = fakeDeckServer();
    renderApp(pastePage);
    await paste(MIXED_PASTE);
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(3, 'cards')}` }));
    await screen.findByRole('heading', { name: 'Preview cards' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove card' }));
    const undo = await screen.findByRole('button', { name: 'Undo' });
    await waitFor(() => expect(document.activeElement).toBe(undo));
    expect(screen.getByText('Card removed.')).toBeDefined();
    expect(screen.getByRole('button', { name: `Import ${count(2, 'cards')}` })).toBeDefined();

    fireEvent.click(undo);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Card 2 of 3' })));
    fireEvent.click(screen.getByRole('button', { name: 'Remove card' }));
    fireEvent.click(await screen.findByRole('button', { name: `Import ${count(2, 'cards')}` }));

    await screen.findByText('2 cards imported.');
    expect(server.imports[0].cards.map((card) => card.question)).toEqual([
      'What is an archipelago?',
      'What is an isthmus?',
    ]);
  });

  it('opens one card at a time and keeps focus on the card that opens or closes', async () => {
    fakeDeckServer();
    renderApp(pastePage);
    await paste(MIXED_PASTE);
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(3, 'cards')}` }));
    await screen.findByRole('heading', { name: 'Preview cards' });
    expect(within(screen.getByRole('list', { name: 'Cards to import' })).getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(previewRow(/^Card 3, What is an isthmus\?/));
    const isthmus = await screen.findByRole('button', { name: 'Card 3 of 3' });
    await waitFor(() => expect(document.activeElement).toBe(isthmus));
    expect(isthmus.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /^Card 2, What is a strait\? Needs an answer$/ })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(document.activeElement).toBe(previewRow(/^Card 3, What is an isthmus\?/)));
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('returns to the text with the preview’s changes kept and previews them again', async () => {
    fakeDeckServer();
    renderApp(pastePage);
    await paste(MIXED_PASTE);
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(3, 'cards')}` }));
    await screen.findByRole('heading', { name: 'Preview cards' });
    fireEvent.change(screen.getByLabelText('Answer'), { target: { value: 'A narrow channel.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));

    const text = (await screen.findByLabelText('Your text')) as HTMLTextAreaElement;
    expect(text.value).toBe(
      'Q: What is an archipelago?\nA: A group of islands.\n\nQ: What is a strait?\nA: A narrow channel.\n\n' +
        'Q: What is an isthmus?\nA: A narrow strip of land.',
    );
    fireEvent.change(text, { target: { value: `${text.value}\n\nWhat is a bay?\nA wide inlet.` } });
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(4, 'cards')}` }));
    await screen.findByText('Ready');
  });

  it('imports a Quizlet export row by row, and Anki rows with their explanation and removed image marked', async () => {
    const server = fakeDeckServer();
    renderApp(pastePage);
    await paste('archipelago\tA group of islands\nstrait\tA narrow channel\nthat joins two seas');
    expect(screen.getByText('2 cards found')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(2, 'cards')}` }));
    expect(await screen.findByText('Ready')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));

    await paste(
      '#separator:tab\n#html:true\nWhich valve?<img src="valve.jpg">\tMitral\tBetween left atrium and ventricle',
    );
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(1, 'card')}` }));
    const valve = await screen.findByRole('button', { name: /^Card 1, Which valve\? Mitral Had an image$/ });
    expect(screen.getByText('Ready')).toBeDefined();
    fireEvent.click(valve);
    expect(await screen.findByText('Image removed. Check that the card still makes sense.')).toBeDefined();
    const explanation = screen.getByLabelText('Explanation');
    expect((explanation as HTMLTextAreaElement).value).toBe('Between left atrium and ventricle');
    fireEvent.change(explanation, { target: { value: 'Also called the bicuspid valve.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));

    const text = (await screen.findByLabelText('Your text')) as HTMLTextAreaElement;
    expect(text.value).toBe('#separator:tab\n#notetype:Revue\nWhich valve?\tMitral\tAlso called the bicuspid valve.');
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(1, 'card')}` }));
    fireEvent.click(await screen.findByRole('button', { name: `Import ${count(1, 'card')}` }));
    await screen.findByText('1 card imported.');
    expect(server.imports[0].cards).toEqual([
      { question: 'Which valve?', answer: 'Mitral', explanation: 'Also called the bicuspid valve.' },
    ]);
  });

  it('keeps each card’s own media mark, even among identical cards, after another card is edited', async () => {
    fakeDeckServer();
    renderApp(pastePage);
    await paste(
      [
        '#separator:tab',
        '#html:true',
        'Which valve?<img src="valve.jpg">\tMitral',
        'Which valve?\tMitral [sound:mitral.mp3]',
        'Which valve?\tMitral',
        'How many chambers?\tFour [sound:four.mp3]',
      ].join('\n'),
    );
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(4, 'cards')}` }));
    fireEvent.click(await screen.findByRole('button', { name: /^Card 4, How many chambers\?/ }));
    fireEvent.change(screen.getByLabelText('Answer'), { target: { value: 'Two atria, two ventricles' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));

    const text = (await screen.findByLabelText('Your text')) as HTMLTextAreaElement;
    expect(text.value).toBe(
      'Q: Which valve?\nA: Mitral\n\nQ: Which valve?\nA: Mitral\n\nQ: Which valve?\nA: Mitral\n\n' +
        'Q: How many chambers?\nA: Two atria, two ventricles',
    );
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(4, 'cards')}` }));
    expect(await screen.findByRole('button', { name: /^Card 1, Which valve\? Mitral Had an image$/ })).toBeDefined();
    expect(previewRow(/^Card 2, Which valve\? Mitral Had audio$/)).toBeDefined();
    expect(previewRow(/^Card 3, Which valve\? Mitral$/)).toBeDefined();
    expect(previewRow(/^Card 4, How many chambers\? Two atria, two ventricles Had audio$/)).toBeDefined();
  });

  it('waits to import until the deck loads, and offers a retry when it can’t', async () => {
    const server = fakeDeckServer({ failedDeckLists: 1 });
    renderApp(pastePage);
    fireEvent.change(await screen.findByLabelText('Your text'), { target: { value: 'One?\n1' } });
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(1, 'card')}` }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('This deck couldn’t load, so you can’t import yet.');
    expect(screen.getByRole('button', { name: `Import ${count(1, 'card')}` })).toHaveProperty('disabled', true);
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Philippine geography')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Import ${count(1, 'card')}` }));
    await screen.findByText('1 card imported.');
    expect(server.imports).toHaveLength(1);
  });

  it('keeps the text when it has no cards or more than 200, and says what to change', async () => {
    fakeDeckServer();
    renderApp(pastePage);
    fireEvent.click(await screen.findByRole('button', { name: 'Preview cards' }));
    expect(spoken(screen.getByRole('alert'))).toBe('Paste at least one question with its answer.');
    expect(document.activeElement).toBe(screen.getByLabelText('Your text'));

    const tooMany = Array.from({ length: 201 }, (_, index) => `Question ${index + 1}?\nAnswer`).join('\n\n');
    await paste(tooMany);
    expect(spoken(screen.getByRole('alert'))).toBe(
      'This text has 201 cards. Paste up to 200 at a time, then paste the rest after importing.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview cards' }));
    expect(screen.getByRole('heading', { name: 'Paste cards' })).toBeDefined();
    expect((screen.getByLabelText('Your text') as HTMLTextAreaElement).value).toBe(tooMany);
  });

  it('keeps the preview after an unknown result and retries with the same key', async () => {
    let attempts = 0;
    const server = fakeDeckServer({
      answerImport: () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return jsonResponse(201, { deckId: '7', importedCards: 2 });
      },
    });
    renderApp(pastePage);
    await paste('One?\n1\n\nTwo?\n2');
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(2, 'cards')}` }));
    fireEvent.click(await screen.findByRole('button', { name: `Import ${count(2, 'cards')}` }));

    expect(spoken(await screen.findByRole('alert'))).toBe(
      'We couldn’t confirm the import. Check your connection, then import again. Trying again won’t add the cards twice.',
    );
    expect(screen.getByRole('heading', { name: 'Preview cards' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: `Import ${count(2, 'cards')}` }));

    await screen.findByText('2 cards imported.');
    expect(server.imports).toHaveLength(2);
    expect(server.imports[1].key).toBe(server.imports[0].key);
  });

  it('says how many cards to remove while the import is too big for the account, and stops once it fits', async () => {
    fakeDeckServer({ answerImport: () => jsonResponse(409, { reason: 'CARD_LIMIT', availableCards: 1 }) });
    renderApp(pastePage);
    await paste('One?\n1\n\nTwo?\n2\n\nThree?\n3');
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(3, 'cards')}` }));
    fireEvent.click(await screen.findByRole('button', { name: `Import ${count(3, 'cards')}` }));

    const roomForOne = 'Your account has room for 1 more card.';
    expect(spoken(await screen.findByRole('alert'))).toBe(
      `${roomForOne} Remove 2 cards from this import, or delete cards you no longer need.`,
    );
    fireEvent.click(previewRow(/^Card 3, Three\?/));
    fireEvent.click(screen.getByRole('button', { name: 'Remove card' }));
    expect(spoken(screen.getByRole('alert'))).toBe(
      `${roomForOne} Remove 1 card from this import, or delete cards you no longer need.`,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(spoken(screen.getByRole('alert'))).toContain('Remove 2 cards from this import');

    fireEvent.click(screen.getByRole('button', { name: 'Remove card' }));
    fireEvent.click(previewRow(/^Card 2, Two\?/));
    fireEvent.click(screen.getByRole('button', { name: 'Remove card' }));
    expect(await screen.findByRole('button', { name: `Import ${count(1, 'card')}` })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the preview and says Revue changed when the server has no import route, as after a rollback', async () => {
    fakeDeckServer({ answerImport: () => jsonResponse(404) });
    renderApp(pastePage);
    await paste('One?\n1');
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(1, 'card')}` }));
    fireEvent.click(await screen.findByRole('button', { name: `Import ${count(1, 'card')}` }));

    expect(await screen.findByText(/^Revue changed while this page was open, so this wasn’t sent\./)).toBeDefined();
    expect(screen.queryByText(/no longer in your Library/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit text' })).toBeDefined();
    expect(screen.getByRole('button', { name: /^Card 1, One\?/ })).toBeDefined();
  });

  it('explains that an earlier import saved when a changed retry reuses its key', async () => {
    fakeDeckServer({ answerImport: () => jsonResponse(409, { reason: 'CREATE_CONFLICT' }) });
    renderApp(pastePage);
    await paste('One?\n1');
    fireEvent.click(screen.getByRole('button', { name: `Preview ${count(1, 'card')}` }));
    fireEvent.click(await screen.findByRole('button', { name: `Import ${count(1, 'card')}` }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Your earlier import was saved before these changes.');
    expect(within(alert).getByRole('link', { name: 'Open the deck' }).getAttribute('href')).toBe('/library/decks/7');
  });

  it.each([
    { tokenFrom: 'a fresh form token naming the new learner', preparedToken: false },
    { tokenFrom: 'the previous learner’s prepared form token', preparedToken: true },
  ])(
    'saves nothing and drops the paste when another learner signed in after the preview, with $tokenFrom',
    async ({ preparedToken }) => {
      const server = fakeDeckServer();
      renderApp(pastePage);
      await paste('Private question?\nPrivate answer');
      if (preparedToken) fireEvent.input(screen.getByLabelText('Your text'));
      fireEvent.click(screen.getByRole('button', { name: `Preview ${count(1, 'card')}` }));
      const importButton = await screen.findByRole('button', { name: `Import ${count(1, 'card')}` });

      server.signInElsewhereAs('second_learner');
      await act(async () => {
        fireEvent.click(importButton);
      });

      expect(await screen.findByText('This deck isn’t in your Library.')).toBeDefined();
      expect(server.imports).toHaveLength(preparedToken ? 1 : 0);
      expect(server.savedCards()).toEqual([]);
      expect(screen.queryByText(/Private question/)).toBeNull();
    },
  );

  it('opens the paste page from a new card form', async () => {
    fakeDeckServer();
    renderApp('/library/decks/7');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add card' }))[0]);
    fireEvent.click(await screen.findByRole('link', { name: 'Paste many cards at once' }));
    expect(await screen.findByRole('heading', { name: 'Paste cards', level: 1 })).toBeDefined();
    expect((await screen.findByRole('link', { name: 'Philippine geography' })).getAttribute('href')).toBe(
      '/library/decks/7',
    );
  });
});
