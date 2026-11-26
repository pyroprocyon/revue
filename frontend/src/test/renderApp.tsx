import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { appRoutes } from '../app/routes';

/**
 * Renders the whole app at a browser route, without retries, so a failed request fails at once.
 * Pass several paths to start with browser history; the last one is the open page.
 */
export function renderApp(paths: string | string[]) {
  const history = typeof paths === 'string' ? [paths] : paths;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(appRoutes, {
    initialEntries: history,
    initialIndex: history.length - 1,
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, queryClient, router };
}

/** Stubs a signed-out session and supplies the given response for other requests. */
export function stubFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn(async (path: string) =>
    path === '/api/v1/auth/session' ? jsonResponse(200, { signedIn: false }) : jsonResponse(status, body),
  );
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

export function requestBodyText(init: RequestInit | undefined): string {
  if (typeof init?.body !== 'string') throw new Error('Expected a text request body');
  return init.body;
}

export function requestBodyJson(init: RequestInit | undefined): unknown {
  return JSON.parse(requestBodyText(init));
}

export function jsonResponse(status: number, body?: unknown): Response {
  const text = body === undefined ? null : JSON.stringify(body);
  return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
}
