import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadPage, reloadPage } from '../../../shared/navigation/pageLoads';
import { jsonResponse, renderApp } from '../../../test/renderApp';

vi.mock('../../../shared/navigation/pageLoads', () => ({ loadPage: vi.fn(), reloadPage: vi.fn() }));

type StoredCard = {
  id: string;
  question: string;
  answer: string;
  explanation: string | null;
  memoryHook: string | null;
  source: string | null;
  contentVersion: number;
};
type Write = { method: string; path: string; body: unknown; csrf: string | null };

const deckPage = '/library/decks/7';
const osmosis: StoredCard = {
  id: '31',
  question: 'What is osmosis?',
  answer: 'Water moving across a selectively permeable membrane.',
  explanation: null,
  memoryHook: null,
  source: null,
  contentVersion: 1,
};
const emptyQueue = { totalCards: 0, availableCards: 0, dueCards: 0, newCards: 0, nextReviewDate: null, cards: [] };

/** A small in-memory server: writes change what later reads return, like the real one. */
function api({
  cards = [] as StoredCard[],
  failWrite = undefined as (() => Promise<Response>) | undefined,
  failRefresh = false,
  anotherDeck = false,
  pausedDeck = false,
  paused = false,
  due = [] as string[],
  caughtUpUntil = null as string | null,
  initialTitle = 'Biology quiz',
  oldCardPages = false,
  newCardsLeftToday = 10,
  allowanceUnknown = false,
} = {}) {
  let deckTitle: string | null = initialTitle;
  let leftToday = newCardsLeftToday;
  let archived = paused;
  let stored = [...cards];
  const writes: Write[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (path === '/api/v1/auth/session') return jsonResponse(200, { signedIn: true });
    if (path === '/api/v1/me') return jsonResponse(200, { username: 'learner' });
    if (path === '/api/v1/auth/csrf')
      return jsonResponse(200, { token: 'csrf', headerName: 'X-XSRF-TOKEN', username: 'learner' });
    if (path === '/api/v1/me/saved-sets?limit=50&paused=false')
      return jsonResponse(200, { items: [], nextCursor: null });
    if (path.split('?')[0] === '/api/v1/cards/due') return jsonResponse(200, emptyQueue);
    const deck = { id: '7', title: deckTitle, cardCount: stored.length, archived };
    if (method === 'GET') {
      if (path === '/api/v1/decks') {
        const items = deckTitle === null ? [] : [deck];
        if (anotherDeck) items.push({ id: '8', title: 'Chemistry', cardCount: 0, archived: false });
        if (pausedDeck) items.push({ id: '9', title: 'Physics past exam', cardCount: 3, archived: true });
        return jsonResponse(200, { items });
      }
      if (path.split('?')[0] === '/api/v1/decks/7/cards' && deckTitle !== null) {
        const dueIds = archived ? [] : due.filter((id) => stored.some((card) => card.id === id));
        const dueOnly = new URLSearchParams(path.split('?')[1]).get('due') === 'true';
        const progress = {
          dueCards: dueIds.length,
          newCards: archived || caughtUpUntil ? 0 : stored.length - dueIds.length,
          newCardsLeftToday: allowanceUnknown ? undefined : leftToday,
          nextReviewDate: caughtUpUntil,
        };
        const items = dueOnly ? stored.filter((card) => dueIds.includes(card.id)) : stored;
        if (oldCardPages) return jsonResponse(200, { deck, items, nextCursor: null });
        return failRefresh && writes.length
          ? jsonResponse(503)
          : jsonResponse(200, { deck, progress, items, dueCardIds: dueIds, nextCursor: null });
      }
      return jsonResponse(404);
    }
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
    writes.push({ method, path, body, csrf: new Headers(init?.headers).get('X-XSRF-TOKEN') });
    if (failWrite) return failWrite();
    if (method === 'POST' && path === '/api/v1/decks') {
      deckTitle = (body as { title: string }).title;
      return jsonResponse(201, { id: '7', title: deckTitle, cardCount: 0 });
    }
    if (method === 'PATCH' && path === '/api/v1/decks/7') {
      deckTitle = (body as { title: string }).title;
      return jsonResponse(200, { ...deck, title: deckTitle });
    }
    if (path === '/api/v1/decks/7/archive') {
      archived = method === 'PUT';
      return jsonResponse(204);
    }
    if (method === 'DELETE' && path === '/api/v1/decks/7') {
      deckTitle = null;
      return jsonResponse(204);
    }
    if (method === 'POST' && path === '/api/v1/decks/7/cards') {
      const added = { ...osmosis, ...(body as object), id: String(40 + stored.length) };
      stored = [...stored, added];
      return jsonResponse(201, added);
    }
    if (method === 'PATCH' && path === '/api/v1/cards/31') {
      const edited = { ...osmosis, ...(body as object), contentVersion: 2 };
      stored = stored.map((card) => (card.id === '31' ? edited : card));
      return jsonResponse(200, edited);
    }
    if (method === 'DELETE' && path === '/api/v1/cards/31') {
      stored = stored.filter((card) => card.id !== '31');
      return jsonResponse(204);
    }
    return jsonResponse(404);
  });
  vi.stubGlobal('fetch', fetcher);
  return {
    writes,
    fetcher,
    replaceCards(next: StoredCard[]) {
      stored = [...next];
    },
    removeDeck() {
      deckTitle = null;
    },
    setNewCardsLeftToday(left: number) {
      leftToday = left;
    },
  };
}

/** jsdom has no layout. This reports a tablet-or-wider list, so the selected card shows in the side pane. */
function wideLayout() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly report: ResizeObserverCallback;
      constructor(report: ResizeObserverCallback) {
        this.report = report;
      }
      observe(target: Element) {
        this.report([{ target, contentRect: { width: 1000 } } as unknown as ResizeObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
    },
  );
}

/** fireEvent would also change a locked field, which a learner can't type into. */
/** jsdom has no layout. The list starts phone-sized and widen() reports a tablet-or-wider list, like a turned phone. */
function resizableLayout() {
  const watched = new Map<object, { report: ResizeObserverCallback; target: Element }>();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly report: ResizeObserverCallback;
      constructor(report: ResizeObserverCallback) {
        this.report = report;
      }
      observe(target: Element) {
        watched.set(this, { report: this.report, target });
      }
      unobserve() {}
      disconnect() {
        watched.delete(this);
      }
    },
  );
  return {
    widen: () =>
      act(() => {
        for (const { report, target } of watched.values()) {
          report([{ target, contentRect: { width: 1000 } } as unknown as ResizeObserverEntry], {} as never);
        }
      }),
  };
}

function firstWriteHeld(answer: () => Response, later: () => Response = answer) {
  const held: { release?: () => void } = {};
  let writes = 0;
  const failWrite = () => {
    writes += 1;
    if (writes > 1) return Promise.resolve(later());
    return new Promise<Response>((resolve) => {
      held.release = () => resolve(answer());
    });
  };
  return { held, failWrite };
}

function isLocked(label: string) {
  return screen.getByLabelText(label).matches(':disabled');
}

function type(label: string, text: string) {
  const field = screen.getByLabelText(label);
  expect(field.matches(':disabled'), `${label} is locked`).toBe(false);
  fireEvent.change(field, { target: { value: text } });
}

/** The older server's token names no learner and it has no deck routes. An unverifiable one can't answer for its token. */
function serverThatRollsBack(fetcher: ReturnType<typeof api>['fetcher']) {
  const respond = fetcher.getMockImplementation()!;
  const server = { state: 'current' as 'current' | 'older' | 'unverifiable' };
  fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
    if (server.state === 'current') return respond(path, init);
    if (path === '/api/v1/auth/csrf') {
      return server.state === 'older'
        ? jsonResponse(200, { token: 'older', headerName: 'X-XSRF-TOKEN' })
        : jsonResponse(503);
    }
    return path.startsWith('/api/v1/decks') ? jsonResponse(404) : respond(path, init);
  });
  return server;
}

function editorRecovery() {
  return screen.getByText(/^Revue changed while this page was open, so this wasn’t sent/).parentElement!;
}

async function openNewCard() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add card' }));
  await screen.findByRole('heading', { name: 'New card' });
}

function steps() {
  return within(screen.getByRole('list', { name: 'Steps' }))
    .getAllByRole('listitem')
    .map((step) => [step.textContent, step.getAttribute('aria-current')]);
}

describe('personal decks', () => {
  it('restores the Library search after a visit to a matching deck', async () => {
    api({ anotherDeck: true, cards: [osmosis] });
    renderApp('/library');
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search decks' }), {
      target: { value: 'Biology' },
    });
    fireEvent.click(screen.getAllByRole('link', { name: 'Open Biology quiz' })[0]);
    await screen.findByRole('heading', { name: 'Biology quiz', level: 1 });
    fireEvent.click(screen.getAllByRole('link', { name: 'Library' })[0]);
    expect(await screen.findByRole('searchbox', { name: 'Search decks' })).toHaveProperty('value', 'Biology');
  });

  it('keeps paused decks under Paused and points a search to them', async () => {
    api({ pausedDeck: true });
    renderApp('/library');
    fireEvent.click(await screen.findByRole('button', { name: 'Review status: Active' }));
    const showDecks = screen.getByRole('group', { name: 'Show decks' });
    expect(within(showDecks).getByRole('button', { name: 'Active 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('link', { name: 'Open Physics past exam' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review status: Active' }));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search decks' }), { target: { value: 'physics' } });
    expect(await screen.findByText('No active decks match. 1 paused deck matches.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Show paused decks' }));

    expect(screen.getByRole('button', { name: 'Review status: Paused' })).toBeDefined();
    expect(screen.getAllByRole('link', { name: 'Open Physics past exam' }).length).toBeGreaterThan(0);
  });

  it('resumes a paused deck from its page and moves focus to Start', async () => {
    wideLayout();
    const server = api({ paused: true, cards: [osmosis] });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume reviews' }));

    expect(await screen.findByText('Deck resumed.')).toBeDefined();
    expect(server.writes.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/v1/decks/7/archive', csrf: 'csrf' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Start review' })));
  });

  it('reviews due cards from the deck and filters the list to them', async () => {
    const photosynthesis = {
      ...osmosis,
      id: '32',
      question: 'What is photosynthesis?',
      answer: 'Making sugar from light.',
    };
    const { fetcher } = api({ cards: [osmosis, photosynthesis], due: ['32'] });
    renderApp(deckPage);

    const review = await screen.findByRole('link', { name: 'Review 1 due' });
    expect(review.getAttribute('href')).toBe('/review/deck-7');
    expect(screen.getByRole('button', { name: /What is photosynthesis\?.*Due today/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /What is osmosis\?.*Due today/ })).toBeNull();

    fireEvent.click(within(screen.getByRole('group', { name: 'Show cards' })).getByRole('button', { name: 'Due' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /What is osmosis\?/ })).toBeNull());
    expect(fetcher.mock.calls.some(([path]) => String(path).includes('due=true'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Due' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('can show all cards when a saved Due link opens a paused deck', async () => {
    api({ paused: true, cards: [osmosis] });
    renderApp(`${deckPage}?due=1`);
    expect(await screen.findByText('No cards are due.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'All cards' }));
    expect(await screen.findByRole('button', { name: /What is osmosis/ })).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Show cards' })).toBeNull();
  });

  it('focuses Add card after resuming a caught-up deck', async () => {
    api({ paused: true, cards: [osmosis], caughtUpUntil: '2026-11-20' });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume reviews' }));
    await screen.findByText('Next review Fri, Nov 20');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add card' })));
  });

  it('shows the next review date and offers Add card when a deck is caught up', async () => {
    api({ cards: [osmosis], caughtUpUntil: '2026-11-20' });
    renderApp(deckPage);

    expect(await screen.findByText('Next review Fri, Nov 20')).toBeDefined();
    expect(screen.queryByRole('link', { name: /Review|Start/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add card' })).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'Show cards' })).toBeNull();
  });

  it('shows how many of today’s 10 new cards are left in a pill beside the card count', async () => {
    api({ cards: [osmosis], newCardsLeftToday: 3 });
    renderApp(deckPage);

    expect(await screen.findByText('3 new cards left today')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Start review' })).toBeDefined();
  });

  it('replaces Start with Add card once today’s new cards are used', async () => {
    api({ cards: [osmosis], newCardsLeftToday: 0 });
    renderApp(deckPage);

    expect(await screen.findByText('New cards tomorrow')).toBeDefined();
    expect(screen.queryByRole('link', { name: /Review|Start/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add card' })).toHaveLength(1);
  });

  it('keeps Start and hides the count when an older server leaves the allowance out', async () => {
    api({ cards: [osmosis], allowanceUnknown: true });
    renderApp(deckPage);

    expect(await screen.findByRole('link', { name: 'Start review' })).toBeDefined();
    expect(screen.queryByText(/new cards? left today|New cards tomorrow/)).toBeNull();
  });

  it('refreshes an open deck when the study day changes at Manila midnight', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-11-20T15:59:50Z') });
    try {
      const server = api({ cards: [osmosis], newCardsLeftToday: 0 });
      renderApp(deckPage);
      expect(await screen.findByText('New cards tomorrow')).toBeDefined();
      server.setNewCardsLeftToday(10);
      await act(() => vi.advanceTimersByTimeAsync(11_000));
      expect(await screen.findByText('10 new cards left today')).toBeDefined();
      expect(screen.getByRole('link', { name: 'Start review' })).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers a way back to Library from the top of a deck page', async () => {
    api({ cards: [osmosis] });
    renderApp(deckPage);
    await screen.findByRole('heading', { name: 'Biology quiz', level: 1 });

    fireEvent.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Back to Library' }));
    expect(await screen.findByRole('heading', { name: 'Library', level: 1 })).toBeDefined();
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: 'Back to Library' })).toBeNull();
  });

  it('keeps an unsaved editor when a background refresh removes its card from the results', async () => {
    wideLayout();
    const { replaceCards, writes } = api({ cards: [osmosis] });
    const { queryClient } = renderApp(`${deckPage}?q=osmosis`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit card' }));
    type('Answer', 'Keep my unsaved correction');

    replaceCards([]);
    await act(() => queryClient.invalidateQueries({ queryKey: ['decks'] }));
    await screen.findByText('0 cards');

    expect(screen.getByLabelText('Answer')).toHaveProperty('value', 'Keep my unsaved correction');
    expect(screen.queryByText('No cards match your search.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Answer')).toHaveProperty('value', 'Keep my unsaved correction');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByLabelText('Answer')).toBeNull();
    expect(screen.getByText('No cards match your search.')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Cards' }));
    expect(writes).toEqual([]);
  });

  it('keeps a draft when its deck disappears and a save is rejected', async () => {
    wideLayout();
    const { removeDeck } = api({ cards: [osmosis], failWrite: async () => jsonResponse(404) });
    const { queryClient } = renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit card' }));
    type('Answer', 'Keep this until I can copy it');
    removeDeck();
    await act(() => queryClient.invalidateQueries({ queryKey: ['decks'] }));
    await screen.findByText('This deck isn’t in your Library.');
    expect(screen.getByLabelText('Answer')).toHaveProperty('value', 'Keep this until I can copy it');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await screen.findByText('This is no longer in your Library. It may have been deleted in another tab.');
    expect(screen.getByLabelText('Answer')).toHaveProperty('value', 'Keep this until I can copy it');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.queryByLabelText('Answer')).toBeNull());
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Back to Library' })).toBeDefined();
  });

  it('keeps one draft at a time and asks before switching to another card', async () => {
    wideLayout();
    const { writes } = api({ cards: [osmosis, { ...osmosis, id: '32', question: 'Second question' }] });
    renderApp(deckPage);
    const preview = () => within(screen.getByRole('region', { name: 'Selected card' }));
    expect(await screen.findByRole('button', { name: /What is osmosis\?/, pressed: true })).toBeDefined();
    fireEvent.click(preview().getByRole('button', { name: 'Edit card' }));
    type('Answer', 'Unsaved correction');

    const second = screen.getByRole('button', { name: /Second question/ });
    fireEvent.click(second);
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Answer')).toHaveProperty('value', 'Unsaved correction');

    fireEvent.click(second);
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByLabelText('Answer')).toBeNull();
    expect(preview().getByText('Second question')).toBeDefined();
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(writes).toEqual([]);
  });

  it('opens, edits and adds cards full screen on phones', async () => {
    api({ cards: [osmosis] });
    renderApp(deckPage);
    const row = await screen.findByRole('button', { name: /What is osmosis\?/ });
    expect(row.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.queryByRole('region', { name: 'Selected card' })).toBeNull();

    fireEvent.click(row);
    const card = screen.getByRole('dialog', { name: osmosis.question });
    expect(within(card).getByText(osmosis.answer)).toBeDefined();
    expect(document.activeElement).toBe(within(card).getByRole('heading', { name: osmosis.question }));
    fireEvent.click(within(card).getByRole('button', { name: 'Back to cards' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);

    fireEvent.click(row);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit card' }));
    const editScreen = screen.getByRole('dialog', { name: 'Edit card' });
    expect(within(editScreen).getByLabelText('Question')).toHaveProperty('value', osmosis.question);
    fireEvent.click(within(editScreen).getByRole('button', { name: 'Cancel' }));
    const cardScreen = screen.getByRole('dialog', { name: osmosis.question });
    expect(document.activeElement).toBe(within(cardScreen).getByRole('heading', { name: osmosis.question }));
    fireEvent.click(within(cardScreen).getByRole('button', { name: 'Back to cards' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /What is osmosis\?/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    const newCard = screen.getByRole('dialog', { name: 'New card' });
    expect(within(newCard).queryByRole('button', { name: 'Back to cards' })).toBeNull();
    expect(within(newCard).getByRole('button', { name: 'Save card' }).getAttribute('form')).toBe(
      newCard.querySelector('form')?.id,
    );
    type('Question', 'Unsaved question');
    fireEvent.click(within(newCard).getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add card' }));
  });

  it('sends one search after typing pauses and cancels an update when Escape clears the search', async () => {
    const { fetcher } = api({ cards: [osmosis] });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Search cards' }));
    const field = await screen.findByRole('searchbox', { name: 'Search cards' });
    const searches = () => fetcher.mock.calls.map(([path]) => path).filter((path) => path.includes('?q='));
    const advance = (milliseconds: number) => act(() => vi.advanceTimersByTimeAsync(milliseconds));

    vi.useFakeTimers();
    try {
      fireEvent.compositionStart(field);
      fireEvent.change(field, { target: { value: 'o' } });
      await advance(500);
      expect(searches()).toEqual([]);
      fireEvent.compositionEnd(field);
      await advance(250);
      fireEvent.change(field, { target: { value: 'osmosis' } });
      await advance(299);
      expect(searches()).toEqual([]);
      await advance(1);
      expect(searches()).toEqual(['/api/v1/decks/7/cards?q=osmosis']);

      fireEvent.change(field, { target: { value: 'membrane' } });
      fireEvent.keyDown(field, { key: 'Escape' });
      await advance(500);
      expect(searches()).toEqual(['/api/v1/decks/7/cards?q=osmosis']);
      expect(field).toHaveProperty('value', '');
      expect(document.activeElement).toBe(field);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts an obsolete card search when a newer search starts', async () => {
    const { fetcher } = api({ cards: [osmosis] });
    const ordinary = fetcher.getMockImplementation()!;
    let obsoleteSignal: AbortSignal | undefined;
    fetcher.mockImplementation((path, init) => {
      if (path.endsWith('?q=old')) {
        obsoleteSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          obsoleteSignal?.addEventListener('abort', () => reject(obsoleteSignal?.reason));
        });
      }
      return ordinary(path, init);
    });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Search cards' }));
    const search = await screen.findByRole('searchbox', { name: 'Search cards' });
    fireEvent.change(search, { target: { value: 'old' } });
    fireEvent.submit(search.closest('form')!);
    await waitFor(() => expect(obsoleteSignal).toBeDefined());
    fireEvent.change(search, { target: { value: 'osmosis' } });
    fireEvent.submit(search.closest('form')!);
    await waitFor(() => expect(obsoleteSignal?.aborted).toBe(true));
    expect(await screen.findByRole('searchbox', { name: 'Search cards' })).toHaveProperty('value', 'osmosis');
  });

  it('waits for an unsaved edit to close before updating search results', async () => {
    wideLayout();
    const { fetcher } = api({ cards: [osmosis] });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit card' }));
    type('Answer', 'Unsaved answer');

    vi.useFakeTimers();
    try {
      type('Search cards', 'osmosis');
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(fetcher.mock.calls.some(([path]) => path.includes('?q='))).toBe(false);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByLabelText('Answer')).toHaveProperty('value', 'Unsaved answer');

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
      await act(() => vi.advanceTimersByTimeAsync(300));
      expect(fetcher.mock.calls.some(([path]) => path.endsWith('/cards?q=osmosis'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers deck creation from an empty Today and lists private decks in Library', async () => {
    api();
    const { unmount } = renderApp('/today');
    const create = await screen.findByRole('link', { name: 'Create a deck' });
    expect(create.getAttribute('href')).toBe('/library/decks/new');
    unmount();

    renderApp('/library');
    const decks = within(await screen.findByRole('region', { name: 'My decks' }));
    const carousel = await decks.findByRole('region', { name: 'Decks' });
    expect(within(carousel).getByRole('link', { name: 'Open Biology quiz' }).getAttribute('href')).toBe(deckPage);
  });

  it('creates a deck with a CSRF-protected request and opens it ready for the first card', async () => {
    const { writes } = api();
    renderApp('/library/decks/new');
    await screen.findByLabelText('Name');
    expect(steps()).toEqual([
      ['Deck', 'step'],
      ['Cards', null],
    ]);
    type('Name', 'Chemistry finals');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('heading', { name: 'Chemistry finals', level: 1 })).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'New card' })).toBeDefined();
    expect(
      within(screen.getByRole('dialog', { name: 'New card' })).getByRole('button', { name: 'Save card' }),
    ).toBeDefined();
    expect(steps()).toEqual([
      ['Deck, done', null],
      ['Cards', 'step'],
    ]);
    expect(screen.queryByText('0 cards')).toBeNull();
    expect(writes).toEqual([
      { method: 'POST', path: '/api/v1/decks', body: { title: 'Chemistry finals' }, csrf: 'csrf' },
    ]);
  });

  it('keeps the workspace usable when a deck page fails to render', async () => {
    const reactLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    api({ oldCardPages: true });
    renderApp(deckPage);
    const heading = await screen.findByRole('heading', { name: 'Something went wrong', level: 1 });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText('This page stopped working. Cards and progress you saved are safe.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Go to Today' }).getAttribute('href')).toBe('/today');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadPage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('link', { name: 'Library' })[0]);
    expect(await screen.findByRole('heading', { name: 'Library', level: 1 })).toBeDefined();
    expect(screen.queryByText('Something went wrong')).toBeNull();
    reactLog.mockRestore();
  });

  it('cancels creating a deck back to Library without a request', async () => {
    const { writes } = api();
    renderApp('/library/decks/new');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Library', level: 1 })).toBeDefined();
    expect(writes).toEqual([]);
  });

  it('asks once before Cancel discards a new deck name', async () => {
    const { writes } = api();
    renderApp('/library/decks/new');
    await screen.findByLabelText('Name');
    type('Name', 'Chemistry finals');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const prompt = screen.getByRole('dialog', { name: 'Discard your changes?' });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByRole('heading', { name: 'Library', level: 1 })).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).toBeNull();
    expect(writes).toEqual([]);
  });

  it('shows the discard prompt again when Back follows Keep editing before the guard reset renders', async () => {
    api();
    const { router } = renderApp(['/library', '/library/decks/new']);
    await screen.findByLabelText('Name');
    type('Name', 'Chemistry finals');
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    const prompt = screen.getByRole('dialog', { name: 'Discard your changes?' });
    await act(async () => {
      fireEvent.click(within(prompt).getByRole('button', { name: 'Keep editing' }));
      void router.navigate(-1);
    });
    expect(router.state.location.pathname).toBe('/library/decks/new');
    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toHaveProperty('open', true);
  });

  it('stays on the page the learner chose when a Create response arrives after they left', async () => {
    let answerCreate = () => {};
    const created = new Promise<Response>((resolve) => {
      answerCreate = () => resolve(jsonResponse(201, { id: '7', title: 'Chemistry finals', cardCount: 0 }));
    });
    const { writes } = api({ failWrite: () => created });
    const { router } = renderApp('/library/decks/new');
    await screen.findByLabelText('Name');
    type('Name', 'Chemistry finals');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    const prompt = screen.getByRole('dialog', { name: 'Discard your changes?' });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/today'));
    await act(async () => {
      answerCreate();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(router.state.location.pathname).toBe('/today');
  });

  it('shows an empty deck’s page with Add card on later visits instead of opening the form', async () => {
    api();
    renderApp(deckPage);

    expect(await screen.findByRole('heading', { name: 'Biology quiz', level: 1 })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'New card' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add card' })).toBeDefined();
  });

  it('opens the first card only once after Create, not again when the learner comes back', async () => {
    api();
    const { router } = renderApp('/library/decks/new');
    await screen.findByLabelText('Name');
    type('Name', 'Chemistry finals');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const editor = await screen.findByRole('dialog', { name: 'New card' });
    await waitFor(() => expect(router.state.location.state).not.toMatchObject({ createdDeck: true }));
    fireEvent.click(within(editor).getByRole('button', { name: 'Done' }));
    await act(() => router.navigate('/library'));
    await act(() => router.navigate(-1));

    expect(await screen.findByRole('heading', { name: 'Chemistry finals', level: 1 })).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'New card' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add card' })).toBeDefined();
  });

  it('offers Help beside the Create title and keeps the steps under the title on both steps', async () => {
    wideLayout();
    api();
    renderApp('/library/decks/new');
    const follows = (first: Element, second: Element) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    const title = await screen.findByRole('heading', { name: 'Create a deck', level: 1 });
    expect(within(title.parentElement!).getByRole('link', { name: 'Help' }).getAttribute('href')).toBe('/help');
    expect(follows(title, screen.getByRole('list', { name: 'Steps' }))).toBe(true);

    type('Name', 'Chemistry finals');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const deckTitle = await screen.findByRole('heading', { name: 'Chemistry finals', level: 1 });
    expect(follows(deckTitle, screen.getByRole('list', { name: 'Steps' }))).toBe(true);
  });

  it('leaves the first card closed when a search is cleared after Done', async () => {
    api();
    const { router } = renderApp('/library/decks/new');
    await screen.findByLabelText('Name');
    type('Name', 'Chemistry finals');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'New card' })).getByRole('button', { name: 'Done' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search cards' }));
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search cards' }), { target: { value: 'osmosis' } });
    await waitFor(() => expect(router.state.location.search).toBe('?q=osmosis'));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear card search' }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByRole('heading', { name: 'Chemistry finals', level: 1 })).toBeDefined();
    expect(screen.queryByRole('dialog', { name: 'New card' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'New card' })).toBeNull();
  });

  it('keeps the phone card editor open when Escape arrives during a save', async () => {
    let release!: () => void;
    api({
      failWrite: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(jsonResponse(201, { ...osmosis, id: '40' }));
        }),
    });
    renderApp(deckPage);
    await openNewCard();
    type('Question', 'What is osmosis?');
    type('Answer', 'Water crossing a membrane.');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    const editor = screen.getByRole('dialog', { name: 'New card' });
    await waitFor(() => expect(release).toBeDefined());
    fireEvent(editor, new Event('cancel', { cancelable: true }));

    expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).toBeNull();
    expect(editor).toHaveProperty('open', true);
    await act(async () => release());
    expect(await screen.findByText('Card added.')).toBeDefined();
  });

  it('locks a card form opened during an earlier save, then leaves it empty for the next card', async () => {
    wideLayout();
    const { held, failWrite } = firstWriteHeld(() =>
      jsonResponse(201, { ...osmosis, id: '40', question: 'First question' }),
    );
    api({ cards: [osmosis], failWrite });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Add card' }));
    type('Question', 'First question');
    type('Answer', 'First answer');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(held.release).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /What is osmosis\?/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDefined();
    expect(isLocked('Question')).toBe(true);

    await act(async () => held.release!());
    await waitFor(() => expect(isLocked('Question')).toBe(false));
    expect(screen.queryByText('Card added.')).toBeNull();
    type('Question', 'Second question');
    expect(screen.getByLabelText('Question')).toHaveProperty('value', 'Second question');
  });

  it('keeps an edit locked through its save when the phone screen widens into the side pane', async () => {
    const layout = resizableLayout();
    const { held, failWrite } = firstWriteHeld(() =>
      jsonResponse(200, { ...osmosis, answer: 'First correction', contentVersion: 2 }),
    );
    api({ cards: [osmosis], failWrite });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: /What is osmosis\?/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit card' }));
    type('Answer', 'First correction');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(held.release).toBeDefined());
    await layout.widen();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Edit card' })).toBeDefined();
    expect(isLocked('Answer')).toBe(true);
    await act(async () => held.release!());
    expect(await screen.findByText('Card saved.')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Edit card' })).toBeNull();
  });

  it('keeps an editor reopened during an earlier save of the same card and shows it the saved version', async () => {
    wideLayout();
    const saved = { ...osmosis, answer: 'First correction', contentVersion: 2 };
    const { held, failWrite } = firstWriteHeld(
      () => jsonResponse(200, saved),
      () => jsonResponse(200, { ...saved, answer: 'Second correction', contentVersion: 3 }),
    );
    const { fetcher } = api({
      cards: [osmosis, { ...osmosis, id: '32', question: 'Second question' }],
      failWrite,
      failRefresh: true,
    });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit card' }));
    type('Answer', 'First correction');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(held.release).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Second question/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    fireEvent.click(screen.getByRole('button', { name: /What is osmosis\?/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit card' }));
    expect(isLocked('Answer')).toBe(true);

    await act(async () => held.release!());
    await waitFor(() => expect(isLocked('Answer')).toBe(false));
    expect(screen.getByLabelText('Answer')).toHaveProperty('value', 'First correction');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Discard your changes?' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Edit card' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit card' }));
    type('Answer', 'Second correction');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    expect(await screen.findByText('Card saved.')).toBeDefined();
    const versions = fetcher.mock.calls
      .filter(([, init]) => init?.method === 'PATCH')
      .map(([, init]) => new Headers(init?.headers).get('X-Content-Version'));
    expect(versions).toEqual(['1', '2']);
  });

  it('keeps a newer card loaded before an earlier save responds', async () => {
    wideLayout();
    const saved = { ...osmosis, answer: 'First correction', contentVersion: 2 };
    const newer = { ...osmosis, answer: 'Correction from another tab', contentVersion: 3 };
    const { held, failWrite } = firstWriteHeld(
      () => jsonResponse(200, saved),
      () => jsonResponse(200, { ...newer, answer: 'Final correction', contentVersion: 4 }),
    );
    const { replaceCards, fetcher } = api({ cards: [osmosis], failWrite });
    const { router } = renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit card' }));
    type('Answer', saved.answer);
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(held.release).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Deck settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));

    replaceCards([newer]);
    await act(() => router.navigate(deckPage + '?q=osmosis'));
    await screen.findByText(newer.answer);
    fireEvent.click(screen.getByRole('button', { name: 'Edit card' }));
    expect(screen.getByLabelText('Answer')).toHaveProperty('value', newer.answer);
    await act(async () => held.release!());
    await waitFor(() => expect(isLocked('Answer')).toBe(false));
    expect(screen.getByLabelText('Answer')).toHaveProperty('value', newer.answer);
    type('Answer', 'Final correction');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(screen.queryByLabelText('Answer')).toBeNull());
    const lastPatch = fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH').at(-1);
    expect(new Headers(lastPatch?.[1]?.headers).get('X-Content-Version')).toBe('3');
  });

  it('shows a failed card save only in the form that sent it', async () => {
    wideLayout();
    const { held, failWrite } = firstWriteHeld(() => jsonResponse(409, { reason: 'STALE_CARD' }));
    api({ cards: [osmosis, { ...osmosis, id: '32', question: 'Second question' }], failWrite });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit card' }));
    type('Answer', 'A correction');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(held.release).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Second question/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit card' }));

    await act(async () => held.release!());
    await waitFor(() => expect(isLocked('Question')).toBe(false));
    expect(screen.getByLabelText('Question')).toHaveProperty('value', 'Second question');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a failed new card save only in the form that sent it', async () => {
    wideLayout();
    const { held, failWrite } = firstWriteHeld(() => jsonResponse(409, { reason: 'CARD_LIMIT' }));
    api({ cards: [osmosis], failWrite });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Add card' }));
    type('Question', 'First question');
    type('Answer', 'First answer');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(held.release).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /What is osmosis\?/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }));

    await act(async () => held.release!());
    await waitFor(() => expect(isLocked('Question')).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('writes the first card of a wide deck page inline, without the phone screen', async () => {
    wideLayout();
    api();
    renderApp(deckPage);
    await openNewCard();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save card' }).textContent).toBe('Save card');
  });

  it('sends exactly the typed card, confirms it and clears the form for the next card', async () => {
    const { writes } = api();
    renderApp(deckPage);
    await openNewCard();
    expect(screen.queryByRole('list', { name: 'Steps' })).toBeNull();
    expect(screen.getByText('0 cards')).toBeDefined();
    type('Question', 'What is diffusion?');
    type('Answer', 'Particles spreading out.');
    type('Source', 'Handout 3');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    expect(await screen.findByText('Card added.')).toBeDefined();
    expect(writes[0]).toEqual({
      method: 'POST',
      path: '/api/v1/decks/7/cards',
      body: {
        question: 'What is diffusion?',
        answer: 'Particles spreading out.',
        explanation: '',
        memoryHook: '',
        source: 'Handout 3',
      },
      csrf: 'csrf',
    });
    await waitFor(() => expect(screen.getByLabelText('Question')).toHaveProperty('value', ''));
    expect(await screen.findByText('What is diffusion?')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/today');
  });

  it('guides answers toward one idea and points long ones to Explanation near the 300-character limit', async () => {
    api();
    renderApp(deckPage);
    await openNewCard();
    const answer = screen.getByLabelText('Answer');
    const description = () =>
      (answer.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent)
        .join(' ');
    expect(answer).toHaveProperty('maxLength', 300);
    expect(description()).toBe('Keep it to one idea');
    type('Answer', 'a'.repeat(270));
    expect(description()).toBe(
      'Keep it to one idea 270 of 300 characters. Add extra details under Optional details, in Explanation.',
    );
  });

  it('keeps the typed card and does not claim a save when the result is unknown', async () => {
    api({ failWrite: () => Promise.reject(new TypeError('connection lost')) });
    renderApp(deckPage);
    await openNewCard();
    type('Question', 'What is diffusion?');
    type('Answer', 'Particles spreading out.');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'We couldn’t confirm the change. Check your connection, then check this page before trying again.',
    );
    expect(screen.getByLabelText('Question')).toHaveProperty('value', 'What is diffusion?');
    expect(screen.queryByText('Card added.')).toBeNull();
  });

  it('keeps an unsent card selectable and offers Today when the previous server’s form token cannot name the learner', async () => {
    const { fetcher, writes } = api();
    const respond = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (path: string, init?: RequestInit) =>
      path === '/api/v1/auth/csrf'
        ? jsonResponse(200, { token: 'csrf', headerName: 'X-XSRF-TOKEN' })
        : respond(path, init),
    );
    renderApp(deckPage);
    await openNewCard();
    type('Question', 'What is diffusion?');
    type('Answer', 'Particles spreading out.');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    expect(await screen.findByRole('heading', { name: 'Revue changed while this page was open' })).toBeDefined();
    expect(screen.getByText(/^Your last change wasn’t sent. Copy anything you typed/)).toBeDefined();
    expect(writes).toHaveLength(0);
    const question = screen.getByLabelText('Question');
    expect(question).toHaveProperty('value', 'What is diffusion?');
    expect(question.closest('[inert]')).toBeNull();
    fireEvent.click(within(editorRecovery()).getByRole('button', { name: 'Go to Today' }));
    expect(loadPage).toHaveBeenCalledWith('/today');
  });

  it('treats a save and refresh that an older server cannot route as unsent, not as a deleted deck', async () => {
    const { fetcher } = api();
    const server = serverThatRollsBack(fetcher);
    const cardsSent = () => fetcher.mock.calls.filter(([, init]) => init?.method === 'POST').length;
    renderApp(deckPage);
    await openNewCard();
    type('Question', 'What is diffusion?');
    type('Answer', 'Particles spreading out.');
    fireEvent.input(screen.getByLabelText('Answer'));
    await waitFor(() => expect(fetcher.mock.calls.some(([path]) => path === '/api/v1/auth/csrf')).toBe(true));
    server.state = 'older';
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    expect(await screen.findByText(/^Revue changed while this page was open, so this wasn’t sent/)).toBeDefined();
    expect(
      await screen.findByText('Decks aren’t available right now. They’re still saved, so try again later.'),
    ).toBeDefined();
    expect(within(editorRecovery()).getByRole('button', { name: 'Go to Today' })).toBeDefined();
    expect(screen.queryByText(/(isn’t|no longer) in your Library/)).toBeNull();
    expect(screen.getByLabelText('Question')).toHaveProperty('value', 'What is diffusion?');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save card' })).toHaveProperty('disabled', false));
    expect(cardsSent()).toBe(1);
  });

  it('calls the result unknown, not a deleted deck, when checking the server after a 404 fails', async () => {
    const { fetcher } = api();
    const server = serverThatRollsBack(fetcher);
    renderApp(deckPage);
    await openNewCard();
    type('Question', 'What is diffusion?');
    type('Answer', 'Particles spreading out.');
    fireEvent.input(screen.getByLabelText('Answer'));
    await waitFor(() => expect(fetcher.mock.calls.some(([path]) => path === '/api/v1/auth/csrf')).toBe(true));
    server.state = 'unverifiable';
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    expect(
      await screen.findByText(
        'We couldn’t confirm the change. Check your connection, then check this page before trying again.',
      ),
    ).toBeDefined();
    expect(await screen.findByText('Couldn’t refresh this deck. The cards below may be out of date.')).toBeDefined();
    expect(screen.queryByText(/(isn’t|no longer) in your Library/)).toBeNull();
    expect(screen.getByLabelText('Question')).toHaveProperty('value', 'What is diffusion?');
  });

  it('says decks are unavailable, not that a change went unsent, when Library only reads during a rollback', async () => {
    const { fetcher } = api();
    const server = serverThatRollsBack(fetcher);
    server.state = 'older';
    renderApp('/library');
    const decks = within(await screen.findByRole('region', { name: 'My decks' }));
    expect(
      await decks.findByText('Decks aren’t available right now. They’re still saved, so try again later.'),
    ).toBeDefined();
    expect(screen.queryByText(/wasn’t sent/)).toBeNull();
    expect(decks.queryByRole('link', { name: 'Create a deck' })).toBeNull();

    server.state = 'current';
    fireEvent.click(decks.getByRole('button', { name: 'Retry decks' }));

    expect(await decks.findAllByRole('link', { name: 'Open Biology quiz' })).not.toHaveLength(0);
    expect(screen.queryByText(/aren’t available|wasn’t sent/)).toBeNull();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')).toHaveLength(0);
  });

  it('drops the rollback warning once a save to the restored server is confirmed', async () => {
    const { fetcher } = api();
    const server = serverThatRollsBack(fetcher);
    const cardsSent = () => fetcher.mock.calls.filter(([, init]) => init?.method === 'POST').length;
    renderApp(deckPage);
    await openNewCard();
    server.state = 'older';
    type('Question', 'What is diffusion?');
    type('Answer', 'Particles spreading out.');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    expect(await screen.findByRole('heading', { name: 'Revue changed while this page was open' })).toBeDefined();

    server.state = 'current';
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    expect(await screen.findByText('Card added.')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Revue changed while this page was open' })).toBeNull();
    expect(screen.queryByText(/wasn’t sent/)).toBeNull();
    expect(cardsSent()).toBe(1);
  });

  it('explains the account card limit', async () => {
    api({ failWrite: async () => jsonResponse(409, { reason: 'CARD_LIMIT' }) });
    renderApp(deckPage);
    await openNewCard();
    type('Question', 'Question');
    type('Answer', 'Answer');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Your account has reached its card limit. Delete some cards to add more.',
    );
  });

  it('edits a card in the side pane and returns focus to Edit card after cancelling', async () => {
    wideLayout();
    const { writes } = api({ cards: [osmosis], failRefresh: true });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit card' }));
    expect(screen.getByLabelText('Question')).toHaveProperty('value', osmosis.question);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit card' }));
    expect(writes).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit card' }));
    type('Answer', 'Water crossing a membrane.');
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    expect(await screen.findByText('Card saved.')).toBeDefined();
    expect(writes).toEqual([
      {
        method: 'PATCH',
        path: '/api/v1/cards/31',
        body: {
          question: osmosis.question,
          answer: 'Water crossing a membrane.',
          explanation: '',
          memoryHook: '',
          source: '',
        },
        csrf: 'csrf',
      },
    ]);
    expect(await screen.findAllByText('Water crossing a membrane.')).not.toHaveLength(0);
    expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t refresh this deck.');
  });

  it('deletes a card only after the learner confirms what will be lost', async () => {
    wideLayout();
    const { writes } = api({ cards: [osmosis], failRefresh: true });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const confirmation = within(screen.getByRole('region', { name: 'Delete card?' }));
    expect(confirmation.getByText('Removes this card and its review progress.')).toBeDefined();
    expect(confirmation.getByText('This can’t be undone.')).toBeDefined();
    expect(document.activeElement).toBe(confirmation.getByRole('button', { name: /^Keep$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Keep$/ }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }));
    expect(writes).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    expect(await screen.findByText('Card deleted.')).toBeDefined();
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/v1/cards/31', body: undefined, csrf: 'csrf' }]);
    expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t refresh this deck.');
    await waitFor(() => expect(screen.queryByText(osmosis.question)).toBeNull());
  });

  it('selects and focuses the next card after the selected one is deleted', async () => {
    wideLayout();
    api({ cards: [osmosis, { ...osmosis, id: '32', question: 'Second question' }] });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    expect(await screen.findByText('Card deleted.')).toBeDefined();
    await waitFor(() =>
      expect(within(screen.getByRole('region', { name: 'Selected card' })).getByText('Second question')).toBeDefined(),
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Second question/, pressed: true }));
  });

  it('keeps the current card selected when an earlier inline deletion finishes', async () => {
    wideLayout();
    const second = { ...osmosis, id: '32', question: 'Second question' };
    const third = { ...osmosis, id: '33', question: 'Third question' };
    let finishDelete!: () => void;
    const deleteResponse = new Promise<Response>((resolve) => {
      finishDelete = () => resolve(jsonResponse(204));
    });
    const { replaceCards, writes } = api({
      cards: [osmosis, second, third],
      failWrite: () => deleteResponse,
    });
    renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await waitFor(() => expect(writes).toHaveLength(1));
    const thirdRow = screen.getByRole('button', { name: /Third question/ });
    thirdRow.focus();
    fireEvent.click(thirdRow);
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
    replaceCards([second, third]);
    finishDelete();
    expect(await screen.findByText('Card deleted.')).toBeDefined();
    expect(thirdRow.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(thirdRow);
  });

  it('makes the list one Tab stop on wide screens and moves between cards with arrow keys', async () => {
    wideLayout();
    api({
      cards: [
        osmosis,
        { ...osmosis, id: '32', question: 'Second question' },
        { ...osmosis, id: '33', question: 'Third question' },
      ],
    });
    renderApp(deckPage);
    const first = await screen.findByRole('button', { name: /What is osmosis\?/ });
    const second = screen.getByRole('button', { name: /Second question/ });
    const third = screen.getByRole('button', { name: /Third question/ });
    expect([first, second, third].map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    expect(first.getAttribute('aria-describedby')).toBeTruthy();

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect([first, second, third].map((row) => row.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(second, { key: 'End' });
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(third, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    expect(within(screen.getByRole('region', { name: 'Selected card' })).getByText(osmosis.question)).toBeDefined();
  });

  it('keeps an existing long title and requires shortening it to rename the deck', async () => {
    const legacyTitle = 'A deck title saved when the limit was one hundred characters';
    const { writes } = api({ initialTitle: legacyTitle, cards: [osmosis] });
    renderApp(deckPage);
    await screen.findByRole('heading', { name: legacyTitle, level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Deck settings' }));
    expect(screen.getByLabelText('Name')).toHaveProperty('value', legacyTitle);
    expect(screen.queryByRole('button', { name: 'Save name' })).toBeNull();
    type('Name', `${legacyTitle}!`);
    expect(screen.getByRole('button', { name: 'Save name' })).toHaveProperty('disabled', true);
    type('Name', 'Biology finals');
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await screen.findByRole('heading', { name: 'Biology finals', level: 1 });
    expect(writes).toHaveLength(1);
  });

  it('keeps the learner on the page they chose when a deck deletion is confirmed after they left', async () => {
    const { fetcher } = api({ cards: [osmosis] });
    const respond = fetcher.getMockImplementation()!;
    let releaseDeletion!: () => void;
    const deletionAnswer = new Promise<void>((resolve) => {
      releaseDeletion = resolve;
    });
    fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'DELETE' && path === '/api/v1/decks/7') await deletionAnswer;
      return respond(path, init);
    });
    const { router } = renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Deck settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirmation = screen.getByRole('region', { name: 'Delete deck?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: /^Delete$/ }));

    await act(() => router.navigate('/today'));
    await screen.findByRole('heading', { name: 'Your review', level: 1 });
    await act(async () => {
      releaseDeletion();
    });

    expect(router.state.location.pathname).toBe('/today');
    expect(screen.getByRole('heading', { name: 'Your review', level: 1 })).toBeDefined();
    expect(screen.queryByText(/^Deleted “Biology quiz”/)).toBeNull();
  });

  it('renames a deck and deletes it with its cards after confirmation', async () => {
    const { writes } = api({ cards: [osmosis], anotherDeck: true, pausedDeck: true });
    const { router } = renderApp(deckPage);
    fireEvent.click(await screen.findByRole('button', { name: 'Deck settings' }));
    type('Name', 'Biology finals');
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('heading', { name: 'Biology finals', level: 1 })).toBeDefined();
    expect(screen.getByText('Deck renamed.')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Deck settings' }));

    fireEvent.click(screen.getByRole('button', { name: 'Deck settings' }));
    expect(screen.getByText(/Removes 1\scard and their review progress/)).toBeDefined();
    expect(screen.getByText('This can’t be undone.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirmation = screen.getByRole('region', { name: 'Delete deck?' });
    expect(within(confirmation).getByText(/permanently removes .*1\scard and their review progress/i)).toBeDefined();
    fireEvent.click(within(confirmation).getByRole('button', { name: /^Delete$/ }));
    expect(await screen.findByText('Deleted “Biology finals” and its cards.')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Library', level: 1 })).toBeDefined();
    await waitFor(() => expect(router.state.location.state).toEqual({}));
    expect(screen.getByText('Deleted “Biology finals” and its cards.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Review status: Active' }));
    fireEvent.click(screen.getByRole('button', { name: /^Paused/ }));
    expect(screen.queryByText('Deleted “Biology finals” and its cards.')).toBeNull();
    expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
      'PATCH /api/v1/decks/7',
      'DELETE /api/v1/decks/7',
    ]);
  });

  it('says when a deck is not in the Library instead of showing an empty deck', async () => {
    api();
    renderApp('/library/decks/999');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This deck isn’t in your Library.');
    expect(screen.queryByRole('button', { name: 'Add card' })).toBeNull();
  });
});
