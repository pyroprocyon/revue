import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { historySet, natureSet } from '../test/fixtures';
import { renderApp, stubFetch } from '../test/renderApp';

describe('App', () => {
  it('opens signup directly at the short invitation route', async () => {
    stubFetch(404);
    renderApp('/i');
    expect(screen.getByRole('textbox', { name: /^Username/ })).toBeDefined();
  });

  it('clears signup passwords and mismatch feedback when switching to sign-in', async () => {
    window.history.replaceState({}, '', '/i#viewtest');
    stubFetch(200, [historySet, natureSet]);
    renderApp('/i');
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'student' } });
    const password = crypto.randomUUID();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: password + 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /at least 18/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /privacy notice/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Passwords don’t match.');
    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('Confirm password')).toBeNull();
  });

  it('leads the home page with the headline and the way into the sets', () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Review before it’s due.' })).toBeDefined();
    expect(screen.getByText('You do the thinking. Revue handles the timing.')).toBeDefined();
    // Phones pin the button at the bottom and desktops show it in the hero; CSS shows one of them.
    const browseLinks = screen.getAllByRole('link', { name: 'Browse sets' });
    expect(browseLinks.map((link) => link.getAttribute('href'))).toEqual(['/sets', '/sets']);
    expect(screen.queryByText(/free/i)).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Help and policies' })).toBeNull();
  });

  it('opens the invitation explanation from home and lets visitors continue browsing', async () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    // CSS chooses the phone or desktop action group in a real browser.
    fireEvent.click(screen.getAllByRole('link', { name: 'Create account' })[0]);
    expect(screen.getByRole('heading', { name: 'You’ll need an invitation' })).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Browse sets' }));
    expect(await screen.findByRole('heading', { name: 'Practice sets' })).toBeDefined();
  });

  it('lets returning learners sign in from a direct visit to the invitation explanation', () => {
    const fetchMock = stubFetch(404);
    renderApp('/join');

    expect(screen.getByRole('heading', { name: 'You’ll need an invitation' })).toBeDefined();
    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says "review" only in the headline, using practice, set and comes back elsewhere', () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    const mentions = screen.getAllByText(/\breview/i);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].closest('h1')).not.toBeNull();
  });

  it('loads the list of sets in the background, so Browse sets opens without waiting', async () => {
    const fetchMock = stubFetch(200, [historySet, natureSet]);

    renderApp('/');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/public-sets', expect.anything()));
  });

  it('offers the guide inline on desktop and opens the separate page from the phone link', async () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    expect(screen.getByRole('heading', { level: 2, name: 'How spaced repetition works' }).closest('section')?.id).toBe('how-it-works');
    fireEvent.click(screen.getByRole('link', { name: 'How it works' }));

    expect(screen.getByRole('heading', { level: 1, name: 'How spaced repetition works' })).toBeDefined();
    expect(screen.getByText('Answer from memory.')).toBeDefined();
    fireEvent.click(screen.getByRole('link', { name: 'Browse sets' }));
    expect(await screen.findByRole('heading', { name: 'Practice sets' })).toBeDefined();
  });

  it('shows a sample card from the sets with the real rating look, and nothing to press', () => {
    stubFetch(200, [historySet, natureSet]);
    renderApp('/');

    const sample = screen.getByRole('figure', { name: 'Sample card' });
    expect(sample.textContent).toContain('Who wrote Noli Me Tangere?');
    expect(sample.textContent).toContain('Hard: Right, with effort');
    expect(sample.textContent).toContain('Comes back');
    expect(sample.textContent).toContain('Example schedule');
    expect(sample.querySelectorAll('a, button, input')).toHaveLength(0);
  });

  it('shows a not-found page for an unknown route', () => {
    renderApp('/no-such-page');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found.' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/');
  });
});
