import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderApp } from '../../../test/renderApp';
import type { RatingRequest, StudyQueue } from '../application/reviews';
import { lastConfirmedProfile } from '../../account/presentation/confirmedProfile';
import { focusManager } from '@tanstack/react-query';

const card = {
  id: '23',
  question: 'What do plants need?',
  answer: 'Water',
  explanation: null,
  memoryHook: null,
  source: 'https://example.com',
  setTitle: 'Plant life',
  publisherName: 'Revue',
  contentVersion: 1,
  version: 0,
};
const empty: StudyQueue = {
  totalCards: 0,
  availableCards: 0,
  dueCards: 0,
  newCards: 0,
  nextReviewDate: null,
  cards: [],
  topics: [],
};
const ready: StudyQueue = {
  ...empty,
  totalCards: 1,
  availableCards: 1,
  dueCards: 1,
  cards: [card],
  topics: [{ id: 'set-1', title: 'Plant life', dueCards: 1 }],
};
const done: StudyQueue = { ...ready, dueCards: 0, cards: [], topics: [], nextReviewDate: '2026-11-14' };

function pausedSummary({ topicTitle, dueCards, newCards, unintroducedCards }: StudyQueue) {
  return { topicTitle, dueCards, newCards, unintroducedCards };
}

function api(queue = empty, write?: (input: RatingRequest) => Promise<Response>) {
  let current = queue;
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/auth/session') return jsonResponse(200, { signedIn: true });
    if (path === '/api/v1/me') return jsonResponse(200, { username: 'learner' });
    if (path.startsWith('/api/v1/cards/due')) {
      return jsonResponse(
        200,
        path.includes('pausedTopic=') ? { continuation: pausedSummary(current), ...current } : current,
      );
    }
    if (path === '/api/v1/auth/csrf')
      return jsonResponse(200, { token: 'form-token', headerName: 'X-XSRF-TOKEN', username: 'learner' });
    if (path === '/api/v1/reviews/23') {
      const input = JSON.parse(String(init?.body)) as RatingRequest;
      const result = write
        ? await write(input)
        : jsonResponse(200, { cardId: '23', requestId: input.requestId, scheduleVersion: 1 });
      if (result.ok) current = done;
      return result;
    }
    return jsonResponse(404);
  });
  vi.stubGlobal('fetch', fetcher);
  return {
    fetcher,
    setQueue(value: StudyQueue) {
      current = value;
    },
  };
}

type TodayAnswer = StudyQueue | 'fails';

function finishTopic(topicAfter: StudyQueue, todayAfter: TodayAnswer | (() => TodayAnswer)) {
  const fixture = api(ready);
  const respond = fixture.fetcher.getMockImplementation()!;
  let rated = false;
  let todayAnswered = false;
  fixture.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/v1/reviews/')) rated = true;
    if (rated && path.startsWith('/api/v1/cards/due')) {
      if (path.includes('topic=')) return jsonResponse(200, topicAfter);
      todayAnswered = true;
      const answer = typeof todayAfter === 'function' ? todayAfter() : todayAfter;
      return answer === 'fails' ? jsonResponse(500) : jsonResponse(200, answer);
    }
    return respond(path, init);
  });
  renderApp('/review/set-1/start');
  return async function afterTodayAnswers() {
    await waitFor(() => expect(todayAnswered).toBe(true));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  };
}

async function refetchTodayOnFocus() {
  const todayReads = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([path]) => String(path).startsWith('/api/v1/cards/due') && !String(path).includes('topic='))
      .length;
  const readsBefore = todayReads();
  try {
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(todayReads()).toBe(readsBefore + 1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  } finally {
    focusManager.setFocused(undefined);
  }
}

async function rateTheOnlyCard() {
  fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
  expect(await screen.findByText('This topic is caught up.')).toBeDefined();
}

describe('saved daily study', () => {
  it('keeps an unfinished fresh review on Today across a reload and clears it when no cards remain', async () => {
    const fresh = { ...ready, dueCards: 0, newCards: 1, topics: [], topicTitle: 'Plant life' };
    const server = api(fresh);
    const started = renderApp('/review/set-1/start');
    await screen.findByRole('button', { name: 'Show answer' });
    fireEvent.click(screen.getByRole('link', { name: 'Finish for now' }));
    expect(await screen.findByRole('link', { name: 'Continue' })).toHaveProperty('pathname', '/review/set-1/start');
    expect(screen.queryByRole('heading', { name: 'No cards due today' })).toBeNull();
    started.unmount();
    const reloaded = renderApp('/today');
    const continuation = await screen.findByRole('link', { name: 'Continue' });
    const description = document.getElementById(continuation.getAttribute('aria-describedby') ?? '');
    expect(description?.querySelector('h3')?.textContent).toBe('Plant life');
    expect(server.fetcher.mock.calls.some(([path]) => path.includes('summaryOnly=true'))).toBe(true);
    reloaded.unmount();
    server.setQueue({ ...done, newCards: 0 });
    renderApp('/today');
    await screen.findByRole('heading', { name: 'All caught up' });
    expect(screen.queryByRole('link', { name: 'Continue' })).toBeNull();
    expect(localStorage.getItem('revue.paused-review.learner')).toBeNull();
  });

  it('opens a paused Today visit with one summary request', async () => {
    localStorage.setItem('revue.paused-review.learner', 'set-1');
    const { fetcher } = api({
      ...ready,
      continuation: { topicTitle: 'Plant life', dueCards: 0, newCards: 2, unintroducedCards: 3 },
    });
    renderApp('/today');
    await screen.findByRole('link', { name: 'Continue' });
    expect(screen.getByText('2 cards remain.')).toBeDefined();
    expect(fetcher.mock.calls.map(([path]) => path).filter((path) => path.startsWith('/api/v1/cards/due'))).toEqual([
      '/api/v1/cards/due?summaryOnly=true&pausedTopic=set-1',
    ]);
  });

  it('keeps other due topics available when the combined summary fails', async () => {
    localStorage.setItem('revue.paused-review.learner', 'set-1');
    const { fetcher } = api({ ...ready, topics: [{ id: 'set-2', title: 'Chemistry', dueCards: 1 }] });
    const ordinary = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((path, init) =>
      path.includes('pausedTopic=') ? Promise.resolve(jsonResponse(503)) : ordinary(path, init),
    );
    renderApp('/today');
    await screen.findByText('Your unfinished review couldn’t load. Try again.');
    expect(screen.getByRole('link', { name: 'Review 1 card' })).toHaveProperty('pathname', '/review/set-2');
    expect(localStorage.getItem('revue.paused-review.learner')).toBe('set-1');
  });

  it("does not show another learner's paused topic or pretend a failed continuation is empty", async () => {
    localStorage.setItem('revue.paused-review.someone-else', 'set-1');
    api();
    const first = renderApp('/today');
    await screen.findByRole('heading', { name: 'No cards to review yet' });
    expect(screen.queryByRole('link', { name: 'Continue' })).toBeNull();
    first.unmount();
    localStorage.setItem('revue.paused-review.learner', 'set-1');
    const server = api({ ...ready, newCards: 1, topics: [{ id: 'set-2', title: 'Chemistry', dueCards: 1 }] });
    const ordinary = server.fetcher.getMockImplementation()!;
    server.fetcher.mockImplementation((path, init) =>
      path.includes('pausedTopic=set-1') ? Promise.resolve(jsonResponse(503)) : ordinary(path, init),
    );
    renderApp('/today');
    expect((await screen.findByRole('alert')).textContent).toContain('unfinished review couldn’t load');
    expect(screen.queryByRole('heading', { name: 'No cards due today' })).toBeNull();
    expect(localStorage.getItem('revue.paused-review.learner')).toBe('set-1');
    expect(screen.getByRole('link', { name: 'Review 1 card' })).toHaveProperty('pathname', '/review/set-2');
  });

  it('offers one due topic and lets the learner switch before starting', async () => {
    const { fetcher } = api({
      ...ready,
      topics: [
        { id: 'set-1', title: 'Plant life', dueCards: 1 },
        { id: 'deck-2', title: 'Biology quiz', dueCards: 6 },
      ],
    });
    renderApp('/today');
    const next = await screen.findByRole('region', { name: 'Up next' });
    expect(within(next).getByRole('link', { name: 'Review 1 card' }).getAttribute('href')).toBe('/review/set-1');
    expect(screen.queryByRole('link', { name: 'Start with 5' })).toBeNull();
    fireEvent.click(screen.getByText('Other topics'));
    fireEvent.click(screen.getByRole('button', { name: 'Biology quiz' }));
    const start = screen.getByRole('link', { name: 'Start with 5' });
    expect(document.activeElement).toBe(start);
    expect(start.getAttribute('href')).toBe('/review/deck-2');
    fireEvent.click(start);
    await screen.findByRole('button', { name: 'Show answer' });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/v1\/cards\/due\?topic=deck-2&includeNew=false$/),
      expect.anything(),
    );
  });

  it('shows recent study days when the learner is caught up', async () => {
    const studyDays = [
      { date: '2026-11-08', studied: false },
      { date: '2026-11-09', studied: true },
      { date: '2026-11-10', studied: false },
      { date: '2026-11-11', studied: false },
      { date: '2026-11-12', studied: false },
      { date: '2026-11-13', studied: true },
      { date: '2026-11-14', studied: false },
    ];
    api({ ...done, studyDays });
    renderApp('/today');
    await screen.findByRole('heading', { name: '2 days studied' });
    expect(screen.getByRole('heading', { name: 'All caught up' })).toBeDefined();
    expect(screen.getAllByRole('listitem', { name: /, studied$/ })).toHaveLength(2);
  });

  it('keeps the continuation for tomorrow when the daily new-card allowance is exhausted', async () => {
    localStorage.setItem('revue.paused-review.learner', 'set-1');
    const server = api({ ...done, newCards: 0, unintroducedCards: 4 });
    const today = renderApp('/today');
    await screen.findByRole('heading', { name: 'All caught up' });
    expect(screen.queryByRole('link', { name: 'Continue' })).toBeNull();
    expect(localStorage.getItem('revue.paused-review.learner')).toBe('set-1');
    today.unmount();
    server.setQueue({ ...ready, dueCards: 0, newCards: 4, unintroducedCards: 4, topics: [], topicTitle: 'Plant life' });
    renderApp('/today');
    expect(await screen.findByRole('link', { name: 'Continue' })).toBeDefined();
  });

  it('offers Library in place of a topic picker when there are only new cards', async () => {
    api({ ...ready, dueCards: 0, newCards: 1, topics: [] });
    renderApp('/today');
    await screen.findByRole('heading', { name: 'No cards due today' });
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Review 1 card' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open Library' }).getAttribute('href')).toBe('/library');
  });

  it.each(['confirmed', 'lost'])(
    'refreshes Today when a rating settles after leaving the batch (%s response)',
    async (response) => {
      let finish: (() => void) | undefined;
      const fixture = api(
        ready,
        (input) =>
          new Promise<Response>((resolve, reject) => {
            finish = () => {
              fixture.setQueue(done);
              if (response === 'lost') reject(new TypeError('lost response'));
              else resolve(jsonResponse(200, { cardId: card.id, requestId: input.requestId, scheduleVersion: 1 }));
            };
          }),
      );
      renderApp('/review/set-1/start');
      fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
      fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
      await waitFor(() => expect(finish).toBeDefined());
      fireEvent.click(screen.getByRole('link', { name: 'Finish for now' }));
      await screen.findByRole('region', { name: 'Continue review' });

      await act(async () => finish!());
      expect(await screen.findByRole('heading', { name: 'All caught up' })).toBeDefined();
      expect(screen.queryByRole('region', { name: 'Up next' })).toBeNull();
    },
  );

  it('replaces an unfinished Today read when the rating settles and ignores its late response', async () => {
    let finish: (() => void) | undefined;
    const { fetcher } = api(
      ready,
      (input) =>
        new Promise<Response>((resolve) => {
          finish = () =>
            resolve(jsonResponse(200, { cardId: card.id, requestId: input.requestId, scheduleVersion: 1 }));
        }),
    );
    const respond = fetcher.getMockImplementation()!;
    let finishOldRead: (() => void) | undefined;
    let queueReads = 0;
    fetcher.mockImplementation((path, init) => {
      if (path.startsWith('/api/v1/cards/due') && ++queueReads === 2) {
        return new Promise<Response>((resolve) => {
          finishOldRead = () => resolve(jsonResponse(200, ready));
        });
      }
      return respond(path, init);
    });
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await waitFor(() => expect(finish).toBeDefined());
    fireEvent.click(screen.getByRole('link', { name: 'Finish for now' }));
    await waitFor(() => expect(finishOldRead).toBeDefined());

    await act(async () => finish!());
    await screen.findByRole('heading', { name: 'All caught up' });
    await act(async () => finishOldRead!());
    expect(screen.getByRole('heading', { name: 'All caught up' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Up next' })).toBeNull();
  });

  it('explains that new cards wait for tomorrow when Start finds the daily limit used up', async () => {
    api({ ...done, newCards: 0, unintroducedCards: 4, topicTitle: 'Plant life' });
    renderApp('/review/set-1/start');
    expect(await screen.findByRole('heading', { name: 'You’ve reached today’s new-card limit.' })).toBeDefined();
    expect(screen.getByText('This topic’s new cards are ready to start tomorrow.')).toBeDefined();
  });

  it('says no cards are ready when a due review finds none', async () => {
    api({ ...done, newCards: 0, unintroducedCards: 4, topicTitle: 'Plant life' });
    renderApp('/review/set-1');
    expect(await screen.findByRole('heading', { name: 'No cards are ready in this topic.' })).toBeDefined();
  });

  it('returns to sign-in when the tab-return session check reports an expired session', async () => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    renderApp('/review/set-1/start');
    await screen.findByLabelText('Your answer (optional)');
    fetcher.mockImplementation((path, init) => {
      if (path.startsWith('/api/v1/cards/due') || path === '/api/v1/me') return Promise.resolve(jsonResponse(401));
      if (path === '/api/v1/auth/session') return Promise.resolve(jsonResponse(200, { signedIn: false }));
      return respond(path, init);
    });
    fireEvent(window, new Event('focus'));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: card.question })).toBeNull();
  });

  it('keeps the draft and exact retry on tab return without fetching an unused queue', async () => {
    const inputs: RatingRequest[] = [];
    const { fetcher } = api(ready, async (input) => {
      inputs.push(input);
      if (inputs.length === 1) throw new TypeError('lost response');
      return jsonResponse(200, { cardId: card.id, requestId: input.requestId, scheduleVersion: 1 });
    });
    renderApp('/review/set-1/start');
    fireEvent.change(await screen.findByLabelText('Your answer (optional)'), {
      target: { value: 'Keep this answer through a tab return' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await screen.findByRole('button', { name: 'Retry rating' });

    const queueReads = fetcher.mock.calls.filter(([path]) => path.startsWith('/api/v1/cards/due')).length;
    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
        fireEvent(window, new Event('focus'));
      });
      expect(fetcher.mock.calls.filter(([path]) => path.startsWith('/api/v1/cards/due'))).toHaveLength(queueReads);
    } finally {
      focusManager.setFocused(undefined);
    }

    expect(screen.getByRole('button', { name: 'Retry rating' })).toBeDefined();
    expect(screen.getByRole('heading', { name: card.answer })).toBeDefined();
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Back to question' }));
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveProperty(
      'value',
      'Keep this answer through a tab return',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to answer' }));
    expect(inputs).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry rating' }));
    await screen.findByText('1 card reviewed');
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toEqual(inputs[0]);
  });

  it('advances batch progress only after the rating is confirmed', async () => {
    let confirm: (() => void) | undefined;
    api(
      {
        ...ready,
        totalCards: 2,
        availableCards: 2,
        newCards: 2,
        cards: [card, { ...card, id: '24', question: 'What do roots absorb?' }],
      },
      (input) =>
        new Promise<Response>((resolve) => {
          confirm = () =>
            resolve(jsonResponse(200, { cardId: card.id, requestId: input.requestId, scheduleVersion: 1 }));
        }),
    );
    renderApp('/review/set-1/start');
    const progress = await screen.findByRole('progressbar', { name: 'Batch progress' });
    expect(progress.getAttribute('value')).toBe('0');
    expect(progress.getAttribute('max')).toBe('2');
    expect(screen.queryByText('Try to remember')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(progress.getAttribute('value')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await screen.findByText('Saving your rating…');
    expect(progress.getAttribute('value')).toBe('0');
    confirm!();
    await screen.findByRole('heading', { name: 'What do roots absorb?' });
    expect(progress.getAttribute('value')).toBe('1');
    expect(screen.getByLabelText('Your answer (optional)')).toHaveProperty('value', '');
  });

  it('starts a fresh batch on Continue while keeping the total confirmed reviews', async () => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    const nextCard = { ...card, id: '24', question: 'What do roots absorb?' };
    let queue = ready;
    fetcher.mockImplementation(async (path, init) => {
      if (path.startsWith('/api/v1/cards/due')) return jsonResponse(200, queue);
      if (path === '/api/v1/reviews/24') {
        const input = JSON.parse(String(init?.body)) as RatingRequest;
        queue = done;
        return jsonResponse(200, { cardId: nextCard.id, requestId: input.requestId, scheduleVersion: 1 });
      }
      const response = await respond(path, init);
      if (path === '/api/v1/reviews/23') queue = { ...ready, cards: [nextCard] };
      return response;
    });
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await screen.findByRole('heading', { name: '1 card reviewed' });
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 card' }));
    await screen.findByRole('heading', { name: nextCard.question });
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
    expect(screen.getByLabelText('Your answer (optional)')).toHaveProperty('value', '');
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await screen.findByRole('heading', { name: '2 cards reviewed' });
    expect(screen.getByText('This topic is caught up.')).toBeDefined();
  });

  it.each(['loading', 'failed'])('keeps an exit when the completion queue is $0', async (state) => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    let queueReads = 0;
    fetcher.mockImplementation((path, init) => {
      if (path.startsWith('/api/v1/cards/due') && ++queueReads > 1) {
        return state === 'loading' ? new Promise<Response>(() => {}) : Promise.resolve(jsonResponse(503));
      }
      return respond(path, init);
    });
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    if (state === 'loading') await screen.findByText('Checking your remaining cards…');
    else await screen.findByRole('alert');
    const exit = screen.getByRole('link', { name: 'Back to Today' });
    expect(screen.queryByRole('link', { name: 'Finish for now' })).toBeNull();
    fireEvent.click(exit);
    expect(await screen.findByRole('heading', { name: 'Your review' })).toBeDefined();
    expect(fetcher.mock.calls.filter(([path]) => path.includes('/reviews/'))).toHaveLength(1);
  });

  it.each([
    { reveal: 'Show answer', mode: 'ANSWERED', rating: /^Good:/ },
    { reveal: 'I don’t know yet', mode: 'SHOWN', rating: /^Finish batch$/ },
  ])(
    'preserves the $mode attempt and shows the draft only after an answer attempt',
    async ({ reveal, mode, rating }) => {
      const { fetcher } = api(ready);
      renderApp('/review/set-1/start');
      const question = await screen.findByRole('heading', { name: card.question });
      fireEvent.change(screen.getByLabelText('Your answer (optional)'), { target: { value: 'My first recall' } });
      fireEvent.click(question);
      expect(screen.queryByRole('heading', { name: card.answer })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: reveal }));
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: card.answer }));
      expect(screen.queryByRole('heading', { name: card.question })).toBeNull();
      expect(screen.queryByText('My first recall', { selector: 'p' }) !== null).toBe(mode === 'ANSWERED');
      fireEvent.click(screen.getByRole('button', { name: 'Back to question' }));
      expect(document.activeElement).toBe(question);
      if (mode === 'ANSWERED') {
        const field = screen.getByRole('textbox', { name: 'Your answer' });
        expect(field).toHaveProperty('value', 'My first recall');
        expect(field).toHaveProperty('readOnly', true);
      } else {
        expect(screen.queryByRole('textbox')).toBeNull();
      }
      expect(screen.queryByRole('button', { name: /^Good:/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'I don’t know yet' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Back to answer' }));
      expect(fetcher.mock.calls.filter(([path]) => path.includes('/reviews/'))).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: rating }));
      await screen.findByText('1 card reviewed');
      const input = fetcher.mock.calls.find(([path]) => path.includes('/reviews/'))?.[1]?.body;
      expect(JSON.parse(String(input))).toMatchObject({ attemptMode: mode });
      expect(String(input)).not.toContain('My first recall');
    },
  );

  it('keeps the full answer and puts long drafts and optional details behind separate controls', async () => {
    const detailCard = {
      ...card,
      explanation: 'Plants use water for photosynthesis.',
      memoryHook: 'Think about watering a plant.',
    };
    api({ ...ready, cards: [detailCard] });
    renderApp('/review/set-1/start');
    const draft = 'One long line to check. '.repeat(25);
    fireEvent.change(await screen.findByLabelText('Your answer (optional)'), { target: { value: draft } });
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByRole('heading', { name: 'Water' })).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    for (const name of ['Compare with your answer', 'Tip to remember', 'Explanation']) {
      expect(screen.getByRole('button', { name })).toBeDefined();
    }
  });

  it.each(['/', '/sign-in', '/join', '/i', '/register'])('opens Today from the signed-in entry %s', async (path) => {
    api();
    renderApp(path);
    expect(await screen.findByRole('heading', { name: 'Your review' })).toBeDefined();
    expect(await screen.findByText('No cards to review yet')).toBeDefined();
    expect(screen.queryByText('All caught up')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Browse sets' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Revue' }).getAttribute('href')).toBe('/today');
    fireEvent.click(screen.getByRole('link', { name: 'Account' }));
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeDefined();
  });

  it('keeps unknown writes unconfirmed and retries the same payload without sending typed recall', async () => {
    const inputs: RatingRequest[] = [];
    const { fetcher } = api(ready, async (input) => {
      inputs.push(input);
      if (inputs.length === 1) throw new TypeError('lost response');
      return jsonResponse(200, { cardId: '23', requestId: input.requestId, scheduleVersion: 1 });
    });
    renderApp('/review/set-1/start');
    fireEvent.change(await screen.findByLabelText('Your answer (optional)'), {
      target: { value: 'private recall draft' },
    });
    expect(screen.queryByText('Water')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'We couldn’t confirm your rating. Retry to check and save it safely.',
    );
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
    expect(screen.queryByText('1 card reviewed')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to question' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry rating' }));
    expect(await screen.findByText('1 card reviewed')).toBeDefined();
    expect(await screen.findByText('This topic is caught up.')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Finish for now' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Back to Today' })).toHaveLength(1);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toEqual(inputs[0]);
    expect(inputs[0]).toMatchObject({ rating: 'GOOD', attemptMode: 'ANSWERED', expectedVersion: 0, contentVersion: 1 });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private recall draft');
  });

  it('records seeing the answer first only as a miss and never rates on reveal', async () => {
    const { fetcher } = api(ready);
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'I don’t know yet' }));
    expect(screen.queryByRole('button', { name: /^Good:/ })).toBeNull();
    expect(fetcher.mock.calls.filter(([path]) => path.includes('/reviews/'))).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Finish batch' }));
    await screen.findByText('1 card reviewed');
    const input = fetcher.mock.calls.find(([path]) => path.includes('/reviews/'))?.[1]?.body;
    expect(JSON.parse(String(input))).toMatchObject({ rating: 'AGAIN', attemptMode: 'SHOWN' });
  });

  it('leaves an unresolved rating and reloads from authoritative state without replay storage', async () => {
    const fixture = api(ready, async () => {
      throw new TypeError('offline');
    });
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await screen.findByRole('button', { name: 'Retry rating' });
    fixture.setQueue(done);
    fireEvent.click(screen.getByRole('link', { name: 'Finish for now' }));
    expect(await screen.findByText('All caught up')).toBeDefined();
    expect(fixture.fetcher.mock.calls.filter(([path]) => path.includes('/reviews/'))).toHaveLength(1);
  });

  it('shows an edited card again and saves only the rating of its updated text', async () => {
    const edited = { ...card, question: 'What do plants need most?', contentVersion: 2 };
    const sent: RatingRequest[] = [];
    api(ready, async (input) => {
      sent.push(input);
      if (sent.length === 1) return jsonResponse(409, { reason: 'CONTENT_CHANGED', card: edited });
      return jsonResponse(200, { cardId: '23', requestId: input.requestId, scheduleVersion: 1 });
    });
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));

    expect(await screen.findByRole('heading', { name: 'What do plants need most?' })).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(
      'This card was edited. Your rating wasn’t saved, so try the updated question.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));

    expect(await screen.findByText('1 card reviewed')).toBeDefined();
    expect(sent.map((input) => input.contentVersion)).toEqual([1, 2]);
    expect(sent[1].requestId).not.toBe(sent[0].requestId);
  });

  it('names cards due in other topics from the full Today summary once this topic is caught up', async () => {
    const otherTopic = { id: 'set-2', title: 'Weather', dueCards: 3 };
    finishTopic(done, { ...done, dueCards: 3, topics: [otherTopic], nextReviewDate: '2026-11-13' });
    await rateTheOnlyCard();
    expect(await screen.findByText('3 cards are due in other topics.')).toBeDefined();
    expect(screen.queryByText(/^Next review/)).toBeNull();
  });

  it.each([
    ['only the finished topic', [{ id: 'set-1', title: 'Plant life', dueCards: 2 }], null],
    [
      'the finished topic and another',
      [
        { id: 'set-1', title: 'Plant life', dueCards: 1 },
        { id: 'set-2', title: 'Weather', dueCards: 2 },
      ],
      '2 cards are due in other topics.',
    ],
  ])('leaves the finished topic out of the other-topic count when %s is due', async (_, topics, message) => {
    const dueCards = topics.reduce((total, topic) => total + topic.dueCards, 0);
    const afterTodayAnswers = finishTopic(done, { ...done, dueCards, topics, nextReviewDate: '2026-11-13' });
    await rateTheOnlyCard();
    await afterTodayAnswers();
    if (message) expect(screen.getByText(message)).toBeDefined();
    else expect(screen.queryByText(/^Next review|due in/)).toBeNull();
  });

  it('takes the next review date from the full Today summary, not from the finished topic', async () => {
    finishTopic({ ...done, nextReviewDate: '2026-11-20' }, { ...done, nextReviewDate: '2026-11-14' });
    await rateTheOnlyCard();
    const next = await screen.findByText(/^Next review/);
    expect(next.textContent).toContain('Nov 14');
  });

  it.each([
    ['no review is scheduled', { ...done, nextReviewDate: null }],
    ['only new cards are waiting', { ...done, newCards: 4 }],
  ])('makes no overall claim when %s', async (_, today) => {
    const afterTodayAnswers = finishTopic(done, today);
    await rateTheOnlyCard();
    await afterTodayAnswers();
    expect(screen.queryByText(/^Next review|due in/)).toBeNull();
  });

  it('hides the overall due count when a later refresh of the Today summary fails', async () => {
    let todayAnswer: TodayAnswer = { ...done, dueCards: 2, topics: [{ id: 'set-2', title: 'Weather', dueCards: 2 }] };
    finishTopic(done, () => todayAnswer);
    await rateTheOnlyCard();
    expect(await screen.findByText('2 cards are due in other topics.')).toBeDefined();

    todayAnswer = 'fails';
    await refetchTodayOnFocus();

    expect(screen.queryByText(/due in other topics/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to Today' }).getAttribute('href')).toBe('/today');
  });

  it('keeps the confirmed count and Back to Today when a refresh returns the previous server’s summary', async () => {
    let todayAnswer: TodayAnswer = { ...done, dueCards: 2, topics: [{ id: 'set-2', title: 'Weather', dueCards: 2 }] };
    finishTopic(done, () => todayAnswer);
    await rateTheOnlyCard();
    expect(await screen.findByText('2 cards are due in other topics.')).toBeDefined();

    todayAnswer = { ...done, dueCards: 2, topics: undefined };
    await refetchTodayOnFocus();

    expect(screen.getByText('1 card reviewed')).toBeDefined();
    expect(screen.queryByText(/^Next review|due in/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to Today' }).getAttribute('href')).toBe('/today');
  });

  it('pauses the review and offers Today, not a retry, when the previous server’s form token cannot name the learner', async () => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (path: string, init?: RequestInit) =>
      path === '/api/v1/auth/csrf'
        ? jsonResponse(200, { token: 'form-token', headerName: 'X-XSRF-TOKEN' })
        : respond(path, init),
    );
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));

    expect(await screen.findByRole('heading', { name: 'Revue changed while this page was open' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Go to Today' }).closest('[inert]')).toBeNull();
    expect(screen.getByText('Your last change wasn’t sent. Go to Today to keep studying.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry rating' }).closest('[inert]')).not.toBeNull();
    expect(fetcher.mock.calls.filter(([path]) => path.startsWith('/api/v1/reviews/'))).toHaveLength(0);
  });

  it('keeps Back to Today and omits overall claims when the Today summary fails', async () => {
    const afterTodayAnswers = finishTopic(done, 'fails');
    await rateTheOnlyCard();
    await afterTodayAnswers();
    expect(screen.getByRole('link', { name: 'Back to Today' }).getAttribute('href')).toBe('/today');
    expect(screen.queryByText(/^Next review|due in/)).toBeNull();
  });

  it('refreshes a stale tab without counting the rejected rating as completed', async () => {
    const fixture = api(ready, async () => {
      fixture.setQueue(done);
      return jsonResponse(409, { reason: 'STALE_SCHEDULE' });
    });
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    expect(await screen.findByText('0 cards reviewed')).toBeDefined();
    expect(await screen.findByText('This topic is caught up.')).toBeDefined();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('another tab'));
  });

  it('keeps a short draft inline when it ends with blank lines', async () => {
    api(ready);
    renderApp('/review/set-1/start');
    fireEvent.change(await screen.findByLabelText('Your answer (optional)'), { target: { value: 'Water\n\n\n\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('Water', { selector: 'p' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Compare with your answer' })).toBeNull();
  });

  it('names the details button Source when a card has a source but no explanation', async () => {
    api({ ...ready, cards: [{ ...card, explanation: null, source: 'Biology notes, page 12' }] });
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    expect(screen.getByRole('button', { name: 'Source' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Explanation' })).toBeNull();
  });

  it('labels a personal card instead of crediting a publisher', async () => {
    api({ ...ready, cards: [{ ...card, publisherName: null, source: null }] });
    renderApp('/review/set-1/start');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    expect(await screen.findByText('Personal card')).toBeDefined();
    expect(screen.queryByText(/Published by/)).toBeNull();
  });

  it('says when saved cards are not available to study', async () => {
    api({ ...empty, totalCards: 3 });
    renderApp('/today');
    expect(await screen.findByRole('heading', { name: 'No cards available right now' })).toBeDefined();
    expect(screen.queryByText(/Next review/)).toBeNull();
  });

  it('says new cards can start tomorrow apart from the next scheduled review', async () => {
    api({ ...done, newCards: 0, unintroducedCards: 4, nextReviewDate: '2026-11-24' });
    renderApp('/today');
    expect(await screen.findByRole('heading', { name: 'All caught up' })).toBeDefined();
    expect(
      screen.getByText('You’ve reached today’s new-card limit. You can start more new cards tomorrow.'),
    ).toBeDefined();
    expect(screen.getByText('Next review: Tuesday, Nov 24')).toBeDefined();
  });

  it('names the next review day once every available card is done', async () => {
    api(done);
    renderApp('/today');
    expect(await screen.findByRole('heading', { name: 'All caught up' })).toBeDefined();
    expect(screen.getByText('Next review: Saturday, Nov 14')).toBeDefined();
  });
});

describe('signed-in navigation without flicker', () => {
  it('shows the last Today summary on a return visit and replaces it after a rating', async () => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    let queueReads = 0;
    let holdQueue = false;
    fetcher.mockImplementation((path, init) => {
      if (path.startsWith('/api/v1/cards/due')) {
        queueReads += 1;
        if (holdQueue) return new Promise<Response>(() => {});
      }
      return respond(path, init);
    });
    renderApp('/today');
    await screen.findByRole('region', { name: 'Up next' });

    holdQueue = true;
    fireEvent.click(screen.getByRole('link', { name: 'Account' }));
    await screen.findByRole('heading', { name: 'Your account' });
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    expect(await screen.findByRole('region', { name: 'Up next' })).toBeDefined();
    await waitFor(() => expect(queueReads).toBe(2));

    holdQueue = false;
    fireEvent.click(screen.getByRole('link', { name: /Review 1 card/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await screen.findByText('1 card reviewed');
    fireEvent.click(screen.getByRole('link', { name: 'Back to Today' }));
    expect(await screen.findByRole('heading', { name: 'All caught up' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Up next' })).toBeNull();
  });

  it('keeps the workspace layout when Help opens before the session check answers', async () => {
    const { fetcher } = api();
    const respond = fetcher.getMockImplementation()!;
    renderApp('/today');
    await screen.findByText('No cards to review yet');
    fetcher.mockImplementation((path, init) =>
      path === '/api/v1/auth/session' ? new Promise<Response>(() => {}) : respond(path, init),
    );
    fireEvent.click(screen.getByRole('link', { name: 'Help' }));
    expect(await screen.findByRole('heading', { name: 'Help' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Your workspace' })).toBeDefined();
  });

  it('shows Today at once when returning from Help while the session is rechecked', async () => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    renderApp('/today');
    await screen.findByRole('region', { name: 'Up next' });
    fireEvent.click(screen.getByRole('link', { name: 'Help' }));
    await screen.findByRole('heading', { name: 'Help' });
    fetcher.mockImplementation((path, init) =>
      path === '/api/v1/me' ? new Promise<Response>(() => {}) : respond(path, init),
    );
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    expect(await screen.findByRole('region', { name: 'Up next' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Review 1 card' }).closest('[inert]')).not.toBeNull();
  });

  it('forgets the remembered account when a public page learns the session has ended', async () => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    const { queryClient } = renderApp('/today');
    await screen.findByRole('region', { name: 'Up next' });
    expect(lastConfirmedProfile(queryClient)).toEqual({ username: 'learner' });
    fetcher.mockImplementation((path, init) =>
      path === '/api/v1/auth/session' ? Promise.resolve(jsonResponse(200, { signedIn: false })) : respond(path, init),
    );
    fireEvent.click(screen.getByRole('link', { name: 'Help' }));
    await waitFor(() => expect(lastConfirmedProfile(queryClient)).toBeUndefined());
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Your workspace' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Help' })).toBeDefined();
  });

  it('chooses the Help layout only after the session check on a direct visit', async () => {
    const { fetcher } = api();
    const respond = fetcher.getMockImplementation()!;
    let answerSession: (() => void) | undefined;
    fetcher.mockImplementation((path, init) =>
      path === '/api/v1/auth/session'
        ? new Promise<Response>((resolve) => {
            answerSession = () => resolve(jsonResponse(200, { signedIn: true }));
          })
        : respond(path, init),
    );
    renderApp('/help');
    await waitFor(() => expect(answerSession).toBeDefined());
    expect(screen.queryByRole('heading', { name: 'Help' })).toBeNull();
    await act(async () => answerSession!());
    expect(await screen.findByRole('heading', { name: 'Help' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Your workspace' })).toBeDefined();
  });
});
