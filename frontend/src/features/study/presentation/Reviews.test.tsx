import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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
  keyIdeas: ['Water'],
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
};
const ready: StudyQueue = { ...empty, totalCards: 1, availableCards: 1, newCards: 1, cards: [card] };
const done: StudyQueue = { ...ready, newCards: 0, cards: [], nextReviewDate: '2026-11-14' };

function api(queue = empty, write?: (input: RatingRequest) => Promise<Response>) {
  let current = queue;
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/auth/session') return jsonResponse(200, { signedIn: true });
    if (path === '/api/v1/me') return jsonResponse(200, { username: 'learner' });
    if (path === '/api/v1/cards/due') return jsonResponse(200, current);
    if (path === '/api/v1/auth/csrf') return jsonResponse(200, { token: 'form-token', headerName: 'X-XSRF-TOKEN' });
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

describe('saved daily study', () => {
  it.each(['confirmed', 'lost'])('refreshes Today when a rating settles after leaving the batch (%s response)', async (response) => {
    let finish: (() => void) | undefined;
    const fixture = api(ready, (input) => new Promise<Response>((resolve, reject) => {
      finish = () => {
        fixture.setQueue(done);
        if (response === 'lost') reject(new TypeError('lost response'));
        else resolve(jsonResponse(200, { cardId: card.id, requestId: input.requestId, scheduleVersion: 1 }));
      };
    }));
    renderApp('/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await waitFor(() => expect(finish).toBeDefined());
    fireEvent.click(screen.getByRole('link', { name: 'Finish for now' }));
    await screen.findByRole('heading', { name: '1 card ready' });

    await act(async () => finish!());
    expect(await screen.findByRole('heading', { name: 'All caught up' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: '1 card ready' })).toBeNull();
  });

  it('replaces an unfinished Today read when the rating settles and ignores its late response', async () => {
    let finish: (() => void) | undefined;
    const { fetcher } = api(ready, (input) => new Promise<Response>((resolve) => {
      finish = () => resolve(jsonResponse(200, { cardId: card.id, requestId: input.requestId, scheduleVersion: 1 }));
    }));
    const respond = fetcher.getMockImplementation()!;
    let finishOldRead: (() => void) | undefined;
    let queueReads = 0;
    fetcher.mockImplementation((path, init) => {
      if (path === '/api/v1/cards/due' && ++queueReads === 2) {
        return new Promise<Response>((resolve) => { finishOldRead = () => resolve(jsonResponse(200, ready)); });
      }
      return respond(path, init);
    });
    renderApp('/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await waitFor(() => expect(finish).toBeDefined());
    fireEvent.click(screen.getByRole('link', { name: 'Finish for now' }));
    await waitFor(() => expect(finishOldRead).toBeDefined());

    await act(async () => finish!());
    await screen.findByRole('heading', { name: 'All caught up' });
    await act(async () => finishOldRead!());
    expect(screen.getByRole('heading', { name: 'All caught up' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: '1 card ready' })).toBeNull();
  });

  it('returns to sign-in when the tab-return session check reports an expired session', async () => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    renderApp('/review');
    await screen.findByLabelText('Your answer (optional)');
    fetcher.mockImplementation((path, init) => {
      if (path === '/api/v1/cards/due' || path === '/api/v1/me') return Promise.resolve(jsonResponse(401));
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
    renderApp('/review');
    fireEvent.change(await screen.findByLabelText('Your answer (optional)'), {
      target: { value: 'Keep this answer through a tab return' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await screen.findByRole('button', { name: 'Retry rating' });

    const queueReads = fetcher.mock.calls.filter(([path]) => path === '/api/v1/cards/due').length;
    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
        fireEvent(window, new Event('focus'));
      });
      expect(fetcher.mock.calls.filter(([path]) => path === '/api/v1/cards/due')).toHaveLength(queueReads);
    } finally {
      focusManager.setFocused(undefined);
    }

    expect(screen.getByRole('button', { name: 'Retry rating' })).toBeDefined();
    expect(screen.getByRole('heading', { name: card.answer })).toBeDefined();
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Back to question' }));
    expect(screen.getByLabelText('Your answer (optional)')).toHaveProperty('value', 'Keep this answer through a tab return');
    fireEvent.click(screen.getByRole('button', { name: 'Back to answer' }));
    expect(inputs).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry rating' }));
    await screen.findByText('1 card reviewed');
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toEqual(inputs[0]);
  });

  it('advances batch progress only after the rating is confirmed', async () => {
    let confirm: (() => void) | undefined;
    api({ ...ready, totalCards: 2, availableCards: 2, newCards: 2,
      cards: [card, { ...card, id: '24', question: 'What do roots absorb?' }],
    }, (input) => new Promise<Response>((resolve) => {
      confirm = () => resolve(jsonResponse(200, { cardId: card.id, requestId: input.requestId, scheduleVersion: 1 }));
    }));
    renderApp('/review');
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
      if (path === '/api/v1/cards/due') return jsonResponse(200, queue);
      if (path === '/api/v1/reviews/24') {
        const input = JSON.parse(String(init?.body)) as RatingRequest;
        queue = done;
        return jsonResponse(200, { cardId: nextCard.id, requestId: input.requestId, scheduleVersion: 1 });
      }
      const response = await respond(path, init);
      if (path === '/api/v1/reviews/23') queue = { ...ready, cards: [nextCard] };
      return response;
    });
    renderApp('/review');
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
    expect(screen.getByText('All caught up.')).toBeDefined();
  });

  it.each(['loading', 'failed'])('keeps an exit when the completion queue is $0', async (state) => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    let queueReads = 0;
    fetcher.mockImplementation((path, init) => {
      if (path === '/api/v1/cards/due' && ++queueReads > 1) {
        return state === 'loading' ? new Promise<Response>(() => {}) : Promise.resolve(jsonResponse(503));
      }
      return respond(path, init);
    });
    renderApp('/review');
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
  ])('preserves the $mode attempt and shows the draft only after an answer attempt', async ({ reveal, mode, rating }) => {
    const { fetcher } = api(ready);
    renderApp('/review');
    const question = await screen.findByRole('heading', { name: card.question });
    fireEvent.change(screen.getByLabelText('Your answer (optional)'), { target: { value: 'My first recall' } });
    fireEvent.click(question);
    expect(screen.queryByRole('heading', { name: card.answer })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: reveal }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: card.answer }));
    expect(screen.queryByRole('heading', { name: card.question })).toBeNull();
    expect(screen.queryByText('Your answer') !== null).toBe(mode === 'ANSWERED');
    fireEvent.click(screen.getByRole('button', { name: 'Back to question' }));
    expect(document.activeElement).toBe(question);
    const field = screen.queryByLabelText('Your answer (optional)');
    if (mode === 'ANSWERED') {
      expect(field).toHaveProperty('value', 'My first recall');
      expect(field).toHaveProperty('readOnly', true);
    } else {
      expect(field).toBeNull();
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
    renderApp('/review');
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
    expect(await screen.findByText('All caught up.')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Finish for now' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Back to Today' })).toHaveLength(1);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toEqual(inputs[0]);
    expect(inputs[0]).toMatchObject({ rating: 'GOOD', attemptMode: 'ANSWERED', expectedVersion: 0, contentVersion: 1 });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private recall draft');
  });

  it('records seeing the answer first only as a miss and never rates on reveal', async () => {
    const { fetcher } = api(ready);
    renderApp('/review');
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
    renderApp('/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await screen.findByRole('button', { name: 'Retry rating' });
    fixture.setQueue(done);
    fireEvent.click(screen.getByRole('link', { name: 'Finish for now' }));
    expect(await screen.findByText('All caught up')).toBeDefined();
    expect(fixture.fetcher.mock.calls.filter(([path]) => path.includes('/reviews/'))).toHaveLength(1);
  });

  it('refreshes a stale tab without counting the rejected rating as completed', async () => {
    const fixture = api(ready, async () => {
      fixture.setQueue(done);
      return jsonResponse(409, { reason: 'STALE_SCHEDULE' });
    });
    renderApp('/review');
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    expect(await screen.findByText('0 cards reviewed')).toBeDefined();
    expect(await screen.findByText('All caught up.')).toBeDefined();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('another tab'));
  });

  it('says when saved cards are not available to study', async () => {
    api({ ...empty, totalCards: 3 });
    renderApp('/today');
    expect(await screen.findByRole('heading', { name: 'No cards available right now' })).toBeDefined();
    expect(screen.queryByText(/Next review/)).toBeNull();
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
      if (path === '/api/v1/cards/due') {
        queueReads += 1;
        if (holdQueue) return new Promise<Response>(() => {});
      }
      return respond(path, init);
    });
    renderApp('/today');
    await screen.findByRole('heading', { name: '1 card ready' });

    holdQueue = true;
    fireEvent.click(screen.getByRole('link', { name: 'Account' }));
    await screen.findByRole('heading', { name: 'Your account' });
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    expect(await screen.findByRole('heading', { name: '1 card ready' })).toBeDefined();
    await waitFor(() => expect(queueReads).toBe(2));

    holdQueue = false;
    fireEvent.click(screen.getByRole('link', { name: /Review 1 card/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
    await screen.findByText('1 card reviewed');
    holdQueue = true;
    fireEvent.click(screen.getByRole('link', { name: 'Back to Today' }));
    expect(await screen.findByRole('heading', { name: 'All caught up' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: '1 card ready' })).toBeNull();
  });

  it('keeps the workspace layout when Help opens before the session check answers', async () => {
    const { fetcher } = api();
    const respond = fetcher.getMockImplementation()!;
    renderApp('/today');
    await screen.findByText('No cards to review yet');
    fetcher.mockImplementation((path, init) =>
      path === '/api/v1/auth/session' ? new Promise<Response>(() => {}) : respond(path, init));
    fireEvent.click(screen.getByRole('link', { name: 'Help' }));
    expect(await screen.findByRole('heading', { name: 'Help' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Your workspace' })).toBeDefined();
  });

  it('shows Today at once when returning from Help while the session is rechecked', async () => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    renderApp('/today');
    await screen.findByRole('heading', { name: '1 card ready' });
    fireEvent.click(screen.getByRole('link', { name: 'Help' }));
    await screen.findByRole('heading', { name: 'Help' });
    fetcher.mockImplementation((path, init) =>
      path === '/api/v1/me' ? new Promise<Response>(() => {}) : respond(path, init));
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    expect(await screen.findByRole('heading', { name: '1 card ready' })).toBeDefined();
    expect(screen.getByRole('link', { name: /Review 1 card/ }).closest('[inert]')).not.toBeNull();
  });

  it('forgets the remembered account when a public page learns the session has ended', async () => {
    const { fetcher } = api(ready);
    const respond = fetcher.getMockImplementation()!;
    const { queryClient } = renderApp('/today');
    await screen.findByRole('heading', { name: '1 card ready' });
    expect(lastConfirmedProfile(queryClient)).toEqual({ username: 'learner' });
    fetcher.mockImplementation((path, init) =>
      path === '/api/v1/auth/session' ? Promise.resolve(jsonResponse(200, { signedIn: false })) : respond(path, init));
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
        : respond(path, init));
    renderApp('/help');
    await waitFor(() => expect(answerSession).toBeDefined());
    expect(screen.queryByRole('heading', { name: 'Help' })).toBeNull();
    await act(async () => answerSession!());
    expect(await screen.findByRole('heading', { name: 'Help' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Your workspace' })).toBeDefined();
  });
});
