import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { TrialPage } from './TrialPage';
import { publicContentKeys } from '../../catalog/application/publicContentQueries';
import { historyCards, historySet } from '../../../test/fixtures';
import { jsonResponse, renderApp, stubApi, stubFetch } from '../../../test/renderApp';

const recallHintText = /Even a few words are a good start/;

function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

/** Rating buttons are named by their label and meaning, such as "Good: Right, with a pause". */
function rate(label: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}: `) }));
}

function showAnswerAndRate(label: string) {
  click('Check answer');
  rate(label);
}

async function openTrial() {
  const fetchMock = stubFetch(200, historyCards);
  renderApp('/sets/philippine-history/try');
  await screen.findByRole('heading', { name: 'Question 1?' });
  return fetchMock;
}

describe('Five-card trial', () => {
  it('starts on the front of the first card, with the answer hidden', async () => {
    await openTrial();

    expect(screen.getByText('Card 1 of 5')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Question 1?' }));
    expect(screen.queryByText('Answer 1.')).toBeNull();
    expect(screen.queryByText(/^Source:/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Rate your answer' })).toBeNull();
    const checkAnswer = screen.getByRole('button', { name: 'Check answer', description: recallHintText });
    expect(screen.getByRole('heading', { name: 'Question 1?', description: recallHintText })).toBeDefined();
    expect(within(checkAnswer.closest('section')!).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Flip card' })).toBeNull();
  });

  it('flips to the answer, its note and source, and the four ratings', async () => {
    await openTrial();

    click('Check answer');

    const answer = screen.getByRole('heading', { name: 'Answer 1.' });
    expect(document.activeElement).toBe(answer);
    expect(screen.queryByRole('heading', { name: 'Question 1?' })).toBeNull();
    expect(screen.getByText('Note 1.')).toBeDefined();
    expect(screen.getByText('Source: Grade 6 book, page 45')).toBeDefined();
    expect(screen.getByText('Published by Revue')).toBeDefined();
    const ratings = within(screen.getByRole('group', { name: 'Rate your answer' }))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(ratings).toEqual([
      'Missed: Wrong or a guess',
      'Hard: Right, with effort',
      'Good: Right, with a pause',
      'Easy: Right, instantly',
    ]);
  });

  it('shows the source and author credit when a shared card has no explanation', async () => {
    await openTrial();
    showAnswerAndRate('Good');

    click('Check answer');

    expect(screen.getByRole('heading', { name: 'Answer 2.' })).toBeDefined();
    expect(screen.getByText('Source: Class notes, page 2')).toBeDefined();
    expect(screen.getByText('Published by Revue')).toBeDefined();
    expect(screen.queryByText(/^Note/)).toBeNull();
  });

  it('links a source that has a web address', async () => {
    await openTrial();
    showAnswerAndRate('Good');
    showAnswerAndRate('Good');

    click('Check answer');

    expect(screen.getByRole('link', { name: 'Class handout' }).getAttribute('href')).toBe('https://example.com/handout-3');
  });

  it('flips back to reread the question, and the ratings wait on the back', async () => {
    await openTrial();
    click('Check answer');

    click('Back to question');

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Question 1?' }));
    expect(screen.queryByRole('group', { name: 'Rate your answer' })).toBeNull();

    fireEvent.click(screen.getByRole('heading', { name: 'Question 1?' }));
    expect(screen.queryByRole('heading', { name: 'Answer 1.' })).toBeNull();
    expect(screen.queryByText(recallHintText)).toBeNull();

    click('Back to answer');

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Answer 1.' }));
    expect(screen.getByRole('group', { name: 'Rate your answer' })).toBeDefined();
  });

  it('keeps the answer hidden when the question or card surface is tapped', async () => {
    await openTrial();
    const question = screen.getByRole('heading', { name: 'Question 1?' });

    fireEvent.click(question);

    expect(screen.queryByText('Answer 1.')).toBeNull();
    fireEvent.click(question.closest('section')!);
    expect(screen.queryByText('Answer 1.')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Rate your answer' })).toBeNull();
  });

  it('moves straight to the next card after a rating', async () => {
    await openTrial();

    showAnswerAndRate('Missed');

    expect(screen.getByText('Card 2 of 5')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Question 2?' }));
    expect(screen.queryByText('Answer 2.')).toBeNull();
    expect(screen.getByText(recallHintText)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDefined();
  });

  it('keeps the current answer and earlier ratings when a background refresh fails and recovers', async () => {
    const fetchMock = stubFetch(200, historyCards);
    const { queryClient } = renderApp('/sets/philippine-history/try');
    const queryKey = publicContentKeys.trial('philippine-history');
    await screen.findByRole('heading', { name: 'Question 1?' });
    showAnswerAndRate('Missed');
    click('Check answer');

    fetchMock.mockResolvedValue(jsonResponse(503));
    act(() => {
      void queryClient.refetchQueries({ queryKey });
    });
    await waitFor(() => expect(queryClient.getQueryState(queryKey)?.status).toBe('error'));

    expect(screen.getByText('Card 2 of 5')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Answer 2.' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: "We couldn't load this page." })).toBeNull();

    fetchMock.mockResolvedValue(jsonResponse(200, historyCards));
    act(() => {
      void queryClient.refetchQueries({ queryKey });
    });
    await waitFor(() => expect(queryClient.getQueryState(queryKey)?.status).toBe('success'));

    expect(screen.getByText('Card 2 of 5')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Answer 2.' })).toBeDefined();
    rate('Easy');
    for (let card = 3; card <= 5; card++) {
      showAnswerAndRate('Good');
    }
    expect(screen.getByRole('heading', { name: 'You practiced 5 cards.' })).toBeDefined();
    expect(within(screen.getByRole('list', { name: 'Tomorrow' })).getByText('Question 1?')).toBeDefined();
    expect(within(screen.getByRole('list', { name: 'In a week or more' })).getByText('Question 2?')).toBeDefined();
  });

  it('offers a retry when the initial card load fails', async () => {
    const fetchMock = stubFetch(503);
    renderApp('/sets/philippine-history/try');
    await screen.findByRole('heading', { name: "We couldn't load this page." });

    fetchMock.mockResolvedValue(jsonResponse(200, historyCards));
    click('Try again');

    expect(await screen.findByRole('heading', { name: 'Question 1?' })).toBeDefined();
    expect(screen.getByText('Card 1 of 5')).toBeDefined();
  });

  it('goes back to the set it came from', async () => {
    stubApi({ '/api/v1/public-sets/philippine-history': historySet, '/api/v1/public-sets/philippine-history/demo-cards': historyCards });
    renderApp(['/sets/philippine-history', '/sets/philippine-history/try']);
    await screen.findByRole('heading', { name: 'Question 1?' });

    click('Philippine History');

    expect(await screen.findByRole('heading', { level: 1, name: 'Philippine History' })).toBeDefined();
  });

  it('opens the set when Back is pressed on a trial opened directly', async () => {
    stubApi({ '/api/v1/public-sets/philippine-history': historySet, '/api/v1/public-sets/philippine-history/demo-cards': historyCards });
    renderApp('/sets/philippine-history/try');
    await screen.findByRole('heading', { name: 'Question 1?' });

    click('Philippine History');

    expect(await screen.findByRole('heading', { level: 1, name: 'Philippine History' })).toBeDefined();
  });

  it('ends with when each card would come back, says nothing was saved, and never calls the server again', async () => {
    const fetchMock = await openTrial();
    const initialRequests = fetchMock.mock.calls.length;

    for (const label of ['Easy', 'Good', 'Hard', 'Missed', 'Good']) {
      showAnswerAndRate(label);
    }

    const heading = screen.getByRole('heading', { level: 1, name: 'You practiced 5 cards.' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText('Example schedule, soonest first.')).toBeDefined();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Tomorrow', 'In a few days', 'In a week or more',
    ]);
    const sooner = within(screen.getByRole('list', { name: 'Tomorrow' })).getAllByRole('listitem');
    expect(sooner.map((row) => row.textContent)).toEqual(['Question 3?Hard', 'Question 4?Missed']);
    const later = within(screen.getByRole('list', { name: 'In a few days' })).getAllByRole('listitem');
    expect(later.map((row) => row.textContent)).toEqual(['Question 2?Good', 'Question 5?Good']);
    const longest = within(screen.getByRole('list', { name: 'In a week or more' })).getAllByRole('listitem');
    expect(longest.map((row) => row.textContent)).toEqual(['Question 1?Easy']);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('1 card')).toBeDefined();
    expect(screen.getByText(/This practice wasn’t saved./)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Try another set' }).getAttribute('href')).toBe('/sets');
    expect(screen.getByRole('link', { name: 'Back to the set' }).getAttribute('href')).toBe('/sets/philippine-history');
    expect(fetchMock).toHaveBeenCalledTimes(initialRequests);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/public-sets/philippine-history/demo-cards', expect.anything());
  });

  it('shows one timing group and no empty earlier groups when every card was Easy', async () => {
    await openTrial();

    for (let card = 0; card < 5; card++) {
      showAnswerAndRate('Easy');
    }

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'In a week or more',
    ]);
    expect(screen.getAllByText('In a week or more')).toHaveLength(1);
    expect(screen.getByText('5 cards')).toBeDefined();
    expect(within(screen.getByRole('list', { name: 'In a week or more' })).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByRole('heading', { name: 'Tomorrow' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'In a few days' })).toBeNull();
  });

  it('says the trial is unavailable when the server has no trial cards', async () => {
    stubFetch(404);

    renderApp('/sets/philippine-history/try');

    expect(await screen.findByRole('heading', { name: "The 5-card trial isn't available right now." })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to the set' }).getAttribute('href')).toBe('/sets/philippine-history');
  });
  it('keeps the starting questions, answers, credit and ratings when refreshed cards change', async () => {
    const fetchMock = stubFetch(200, historyCards);
    const view = renderApp('/sets/philippine-history/try');
    const queryKey = publicContentKeys.trial('philippine-history');
    await screen.findByRole('heading', { name: 'Question 1?' });
    showAnswerAndRate('Missed');
    click('Check answer');

    const replacement = {
      ...historyCards,
      publisherName: 'Another publisher',
      cards: historyCards.cards.map((card) => ({
        ...card, key: `replacement-${card.key}`, question: `New ${card.question}`, answer: `New ${card.answer}`,
      })).reverse(),
    };
    fetchMock.mockImplementation(async () => jsonResponse(200, replacement));
    act(() => { void view.queryClient.refetchQueries({ queryKey }); });
    await waitFor(() => expect(view.queryClient.getQueryData(queryKey)).toEqual(replacement));

    expect(screen.getByRole('heading', { name: 'Answer 2.' })).toBeDefined();
    expect(screen.getByText('Published by Revue')).toBeDefined();
    rate('Easy');
    for (let card = 3; card <= 5; card++) showAnswerAndRate('Good');
    expect(within(screen.getByRole('list', { name: 'Tomorrow' })).getByText('Question 1?')).toBeDefined();
    expect(within(screen.getByRole('list', { name: 'In a week or more' })).getByText('Question 2?')).toBeDefined();
    expect(screen.queryByText('New Question 5?')).toBeNull();

    view.unmount();
    renderApp('/sets/philippine-history/try');
    expect(await screen.findByRole('heading', { name: 'New Question 5?' })).toBeDefined();
    expect(screen.getByText('Card 1 of 5')).toBeDefined();
  });

  it('ends an active trial when a refresh says its content is unavailable', async () => {
    const fetchMock = stubFetch(200, historyCards);
    const { queryClient } = renderApp('/sets/philippine-history/try');
    await screen.findByRole('heading', { name: 'Question 1?' });
    showAnswerAndRate('Good');
    fetchMock.mockResolvedValue(jsonResponse(404));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: publicContentKeys.trial('philippine-history') });
    });
    expect(await screen.findByRole('heading', { name: "The 5-card trial isn't available right now." })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Check answer' })).toBeNull();
  });

  it('uses its supplied reader without a catalog provider and starts fresh when the set changes', async () => {
    const otherCards = {
      ...historyCards,
      cards: historyCards.cards.map((card) => ({ ...card, question: `Other ${card.question}` })),
    };
    const reader = { trialCards: async (key: string) => key === 'other-set' ? otherCards : historyCards };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(publicContentKeys.trial('philippine-history'), historyCards);
    queryClient.setQueryData(publicContentKeys.trial('other-set'), otherCards);
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/sets/philippine-history/try']}>
          <Link to="/sets/other-set/try">Next trial</Link>
          <Routes>
            <Route path="/sets/:setKey/try" element={<TrialPage reader={reader} />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'Question 1?' });
    showAnswerAndRate('Missed');
    fireEvent.click(screen.getByRole('link', { name: 'Next trial' }));
    expect(await screen.findByRole('heading', { name: 'Other Question 1?' })).toBeDefined();
    expect(screen.getByText('Card 1 of 5')).toBeDefined();
  });

});
