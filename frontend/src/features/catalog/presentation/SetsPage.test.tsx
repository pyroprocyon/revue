import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { historySet, natureSet } from '../../../test/fixtures';
import { jsonResponse, renderApp, stubFetch } from '../../../test/renderApp';

function stubCatalog(answer: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => (path === '/api/v1/public-sets' ? answer() : jsonResponse(200, { signedIn: false }))),
  );
}

describe('Set list', () => {
  it('loads only the requested page and lets readers return to the previous page', async () => {
    const fetchMock = vi.fn(async (path: string) => {
      if (path === '/api/v1/public-sets') {
        const response = jsonResponse(200, [historySet]);
        response.headers.set('X-Next-Cursor', 'next-position');
        return response;
      }
      if (path === '/api/v1/public-sets?after=next-position') return jsonResponse(200, [natureSet]);
      return jsonResponse(404);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/sets');
    await screen.findByText(historySet.title);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/public-sets?after=next-position', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(natureSet.title);
    expect(screen.queryByText(historySet.title)).toBeNull();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText(historySet.title);
  });

  it('opens a linked page and can return to the start without earlier history', async () => {
    const fetchMock = vi.fn(async (path: string) => {
      if (path === '/api/v1/public-sets?after=next-position') return jsonResponse(200, [natureSet]);
      if (path === '/api/v1/public-sets') return jsonResponse(200, [historySet]);
      return jsonResponse(404);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/sets?after=next-position');
    expect(await screen.findByText(natureSet.title)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText(historySet.title)).toBeDefined();
    expect(screen.queryByText(natureSet.title)).toBeNull();
  });

  it('lists every public set, each opening its own preview', async () => {
    stubFetch(200, [historySet, natureSet]);

    renderApp('/sets');

    expect(await screen.findByRole('heading', { level: 1, name: 'Shared sets' })).toBeDefined();
    expect(screen.getByText('Try a five-card practice session.')).toBeDefined();
    await screen.findByText(historySet.title);
    const links = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/sets/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/sets/philippine-history',
      '/sets/philippine-nature',
    ]);
    expect(links[0].textContent).toContain('Five moments from Mactan to Malolos.');
  });

  it('loads the list after a busy catalog answer without a click', async () => {
    const answers = [jsonResponse(503), jsonResponse(200, [historySet])];
    stubCatalog(() => answers.shift() ?? jsonResponse(500));

    renderApp('/sets');

    expect(await screen.findByText(historySet.title, {}, { timeout: 3_000 })).toBeDefined();
    expect(answers).toHaveLength(0);
  });

  it('offers Try again at once after any other failure', async () => {
    const catalogAnswer = vi.fn(() => jsonResponse(500));
    stubCatalog(catalogAnswer);

    renderApp('/sets');

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeDefined();
    expect(catalogAnswer).toHaveBeenCalledTimes(1);
  });

  it('says so when no set is available', async () => {
    stubFetch(200, []);

    renderApp('/sets');

    expect(await screen.findByRole('heading', { name: 'No sets are available right now.' })).toBeDefined();
  });
});
