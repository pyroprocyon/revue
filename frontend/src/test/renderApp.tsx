import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';

/**
 * Renders the whole app at a browser route, without retries, so a failed request fails at once.
 * Pass several paths to start with browser history; the last one is the open page.
 */
export function renderApp(paths: string | string[]) {
  const history = typeof paths === 'string' ? [paths] : paths;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={history} initialIndex={history.length - 1}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Replaces fetch so every request gets this status and JSON body. Returns the mock to inspect calls. */
export function stubFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () => jsonResponse(status, body));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Replaces fetch so each API path answers with its own JSON body; any other path gets 404. */
export function stubApi(bodiesByPath: Record<string, unknown>) {
  const fetchMock = vi.fn(async (path: string) =>
    path in bodiesByPath ? jsonResponse(200, bodiesByPath[path]) : jsonResponse(404),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function jsonResponse(status: number, body?: unknown): Response {
  const text = body === undefined ? null : JSON.stringify(body);
  return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
}
