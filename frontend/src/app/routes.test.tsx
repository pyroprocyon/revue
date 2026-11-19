import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { appRoutes } from './routes';

vi.mock('./App', () => ({
  App: () => {
    throw new Error('Layout failed');
  },
}));

describe('app routes', () => {
  it('replaces a crashed layout with a branded error page and no technical details', async () => {
    const reactLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: ['/library'] })} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Something went wrong', level: 1 })).toBeDefined();
    expect(screen.getByText('This page stopped working.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/');
    expect(screen.queryByText(/Layout failed/)).toBeNull();
    reactLog.mockRestore();
  });
});
