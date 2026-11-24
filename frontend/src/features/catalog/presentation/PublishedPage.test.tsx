import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { historySet, natureSet } from '../../../test/fixtures';
import { jsonResponse, renderApp } from '../../../test/renderApp';

it('searches the subject index and restores both search scopes after navigation', async () => {
  const biology = { ...historySet, title: 'Cell Biology', subject: 'Biology', saveAllowed: true };
  const computing = { ...natureSet, title: 'Data structures', subject: 'Computing', saveAllowed: true };
  const fetcher = vi.fn(async (path: string) => {
    if (path === '/api/v1/me') return jsonResponse(200, { username: 'learner' });
    if (path === '/api/v1/auth/session') return jsonResponse(200, { signedIn: true });
    if (path === '/api/v1/public-sets/catalog/subjects')
      return jsonResponse(
        200,
        [biology, computing].map(({ subject }) => ({ subject, topicCount: 1 })),
      );
    if (path === '/api/v1/public-sets?published=true&limit=100&subject=Computing&q=cell') return jsonResponse(200, []);
    if (
      path === '/api/v1/public-sets?published=true&limit=100&subject=Computing' ||
      path === '/api/v1/public-sets?published=true&limit=100&subject=Computing&q=data'
    )
      return jsonResponse(200, [computing]);
    if (path === '/api/v1/public-sets/philippine-nature') return jsonResponse(200, computing);
    if (path === '/api/v1/me/saved-sets/keys') return jsonResponse(200, []);
    return jsonResponse(404);
  });
  vi.stubGlobal('fetch', fetcher);

  renderApp('/published');
  await screen.findByRole('heading', { level: 1, name: 'Reviewers' });
  const carousel = await screen.findByRole('region', { name: 'Subjects' });
  expect(within(carousel).getByRole('link', { name: 'Open Biology' })).toBeDefined();
  expect(within(carousel).getByText('1 topic')).toBeDefined();
  expect(within(carousel).queryByText('1 of 2')).toBeNull();
  expect(screen.queryByRole('button', { name: 'All subjects' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Browse' }).getAttribute('aria-current')).toBe('page');
  expect(fetcher.mock.calls.some(([path]) => path.includes('published=true'))).toBe(false);

  const subjectSearch = screen.getByRole('searchbox', { name: 'Search subjects' });
  fireEvent.change(subjectSearch, { target: { value: 'data' } });
  expect(screen.getByText('No matching subjects.')).toBeDefined();
  fireEvent.change(subjectSearch, { target: { value: 'computing' } });
  fireEvent.click(screen.getByRole('link', { name: 'Open Computing' }));

  const topicSearch = screen.getByRole('searchbox', { name: 'Search topics' });
  expect(screen.getByRole('heading', { name: 'Computing', level: 1 })).toBeDefined();
  await screen.findByRole('link', { name: /Data structures/ });
  fireEvent.change(topicSearch, { target: { value: 'cell' } });
  expect(await screen.findByText('No matching topics.')).toBeDefined();
  fireEvent.change(topicSearch, { target: { value: 'data' } });
  fireEvent.click(await screen.findByRole('link', { name: /Data structures/ }));
  expect(await screen.findByRole('link', { name: 'Try 5 cards' })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect((await screen.findByRole<HTMLInputElement>('searchbox', { name: 'Search topics' })).value).toBe('data');
  expect(await screen.findByRole('link', { name: /Data structures/ })).toBeDefined();
  fireEvent.click(screen.getByRole('link', { name: /^Reviewers$/ }));
  expect(screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search subjects' }).value).toBe('computing');
});
